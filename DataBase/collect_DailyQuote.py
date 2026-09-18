# DataBase/collect_dailyquote.py
"""
统一采集日线数据（使用 Baostock）
用法：
    python collect_dailyquote.py                                # 全量采集（默认 2020-01-01 ~ 2026-07-01）
    python collect_dailyquote.py --from 2022-01-01       # 指定起始日期
    python collect_dailyquote.py --to 2025-12-31         # 指定截止日期
    python collect_dailyquote.py --code 000001                 # 只采集单只股票
    python collect_dailyquote.py --restart 000300           # 从该代码开始采集
"""

import os
import sys

# 允许从仓库根目录（python DataBase/collect_DailyQuote.py）
# 或从 DataBase 目录（python collect_DailyQuote.py）两种方式启动
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import baostock as bs
import logging
import argparse
import socket
import time
import random
from datetime import datetime, timedelta
from sqlalchemy import text
from DataBase import engines, get_session
from DataBase.Models import StockList, DailyQuote

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Baostock 底层是裸 socket，不设超时时一旦网络卡住会无限挂起（实测出现过）。
# 这里设 60 秒超时，配合下面"单只异常只跳过该只"的逻辑，避免整轮回填被一只股票卡死。
SOCKET_TIMEOUT = 60
socket.setdefaulttimeout(SOCKET_TIMEOUT)

# 只创建本脚本负责的表（不再把 4 张表全建进 DateData.db）
DailyQuote.__table__.create(bind=engines["daily_quote"], checkfirst=True)

# 允许采集的板块
ALLOWED_BOARDS = {'主板', '创业板', '科创板'}

# 单只股票一次性写入（仍是 INSERT OR REPLACE，重跑同一区间结果不变）
UPSERT_SQL = text("""
    INSERT OR REPLACE INTO daily_quote
    (code, date, preclose, open, high, low, close, volume, amount, turn)
    VALUES (:code, :date, :preclose, :open, :high, :low, :close, :volume, :amount, :turn)
""")

# Baostock 日线字段
K_FIELDS = "date,open,high,low,close,preclose,volume,amount,turn"

def to_bs_code(code, market=None):
    """拼 Baostock 代码：优先用 stock_list.market，缺失时回退到代码前缀"""
    if market in ('SH', 'SZ'):
        return f"{market.lower()}.{code}"
    return f"sh.{code}" if code.startswith('6') else f"sz.{code}"

def safe_float(val):
    if val is None or val == '':
        return 0.0
    try:
        return float(val)
    except ValueError:
        return 0.0

def fetch_daily_quote_for_code(code, start_date, end_date, market=None):
    """获取单只股票的日线原始数据（不复权）"""
    bs_code = to_bs_code(code, market)
    rs = bs.query_history_k_data_plus(
        bs_code,
        K_FIELDS,
        start_date=start_date,
        end_date=end_date,
        frequency="d",
        adjustflag="3"  # 不复权
    )
    if rs.error_code != '0':
        logger.warning(f"{code} 查询失败: {rs.error_msg}")
        return []
    rows = []
    while (rs.error_code == '0') & rs.next():
        row = rs.get_row_data()
        if len(row) == 9:
            date_str = row[0]
            open_p = safe_float(row[1])
            high = safe_float(row[2])
            low = safe_float(row[3])
            close = safe_float(row[4])
            preclose = safe_float(row[5])
            volume = safe_float(row[6])
            amount = safe_float(row[7])
            turn = safe_float(row[8])
            if open_p == 0 and high == 0 and low == 0 and close == 0:
                continue
            rows.append({
                'date': date_str,
                'open': open_p,
                'high': high,
                'low': low,
                'close': close,
                'preclose': preclose,
                'volume': volume,
                'amount': amount,
                'turn': turn
            })
    return rows

def save_daily_quote(code, rows):
    """保存日线数据（upsert，单只一次性批量写入）"""
    if not rows:
        return 0
    params = [
        {
            'code': code,
            'date': datetime.strptime(row['date'], '%Y-%m-%d').date().isoformat(),
            'preclose': row['preclose'],
            'open': row['open'],
            'high': row['high'],
            'low': row['low'],
            'close': row['close'],
            'volume': row['volume'],
            'amount': row['amount'],
            'turn': row['turn'],
        }
        for row in rows
    ]
    session = get_session('daily_quote')
    try:
        session.execute(UPSERT_SQL, params)
        session.commit()
        logger.info(f"{code} upsert {len(params)} 条日线")
        return len(params)
    except Exception as e:
        logger.error(f"{code} 保存失败: {e}")
        session.rollback()
        return 0
    finally:
        session.close()

def collect_daily_quotes(start_date, end_date, start_code=None, single_code=None):
    """主控函数"""
    session = get_session('stock_list')
    try:
        query = session.query(StockList.code, StockList.market).filter(
            StockList.board.in_(ALLOWED_BOARDS)
        )
        if single_code:
            query = query.filter(StockList.code == single_code)
            logger.info(f"指定单只股票: {single_code}")
        elif start_code:
            query = query.filter(StockList.code >= start_code)
            logger.info(f"从 {start_code} 开始采集")
        else:
            logger.info("全量采集所有股票")
        targets = [(row[0], row[1]) for row in query.all()]
        total = len(targets)
        if total == 0:
            logger.warning("没有需要采集的股票")
            return
        logger.info(f"共 {total} 只股票，日期 {start_date} ~ {end_date}")
    except Exception as e:
        logger.error(f"读取 StockList.db 失败: {e}")
        logger.error("请先运行 python DataBase/collect_StockList.py 生成股票列表")
        return
    finally:
        session.close()

    lg = bs.login()
    if lg.error_code != '0':
        logger.error(f"Baostock 登录失败: {lg.error_msg}")
        return

    success = fail = 0
    start_time = time.time()
    try:
        for idx, (code, market) in enumerate(targets):
            current = idx + 1
            percent = current / total * 100
            elapsed = time.time() - start_time
            avg_time = elapsed / current
            remaining = (total - current) * avg_time
            logger.info(
                f"进度 [{current}/{total}] {percent:.1f}% | {code} | "
                f"已用 {str(timedelta(seconds=int(elapsed)))} | "
                f"预计剩余 {str(timedelta(seconds=int(remaining)))}"
            )
            try:
                rows = fetch_daily_quote_for_code(code, start_date, end_date, market)
            except Exception as e:
                # 单只异常（多为网络超时）只跳过该只，不中断整轮
                fail += 1
                logger.warning(f"{code} 采集异常，跳过: {e}")
                continue
            if rows:
                save_daily_quote(code, rows)
                success += 1
            else:
                fail += 1
                logger.warning(f"{code} 无数据，跳过")
            time.sleep(random.uniform(0.2, 0.5))
        total_time = str(timedelta(seconds=int(time.time() - start_time)))
        logger.info(f"采集完成！总耗时 {total_time} | 成功 {success}，失败 {fail}")
    except Exception as e:
        logger.error(f"采集出错: {e}")
    finally:
        bs.logout()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='采集日线数据')
    # 使用 dest 映射到内部属性名
    parser.add_argument('--from', dest='start_date', default='2020-01-01', help='起始日期 yyyy-mm-dd')
    parser.add_argument('--to', dest='end_date', default='2026-07-01', help='截止日期 yyyy-mm-dd')
    parser.add_argument('--restart', dest='start_code', help='从该代码开始')
    parser.add_argument('--code', dest='single_code', help='单只股票代码')
    args = parser.parse_args()
    collect_daily_quotes(args.start_date, args.end_date, args.start_code, args.single_code)

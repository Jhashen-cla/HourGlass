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

import baostock as bs
import logging
import argparse
import time
import random
from datetime import datetime, timedelta
from sqlalchemy import text
from DataBase import Base, engines, get_session
from Models import StockList, DailyQuote

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 确保 daily_quote 表存在
Base.metadata.create_all(bind=engines["daily_quote"])

# 允许采集的板块
ALLOWED_BOARDS = {'主板', '创业板', '科创板'}

def safe_float(val):
    if val is None or val == '':
        return 0.0
    try:
        return float(val)
    except ValueError:
        return 0.0

def fetch_daily_quote_for_code(code, start_date, end_date):
    """获取单只股票的日线原始数据（不复权）"""
    bs_code = f"sh.{code}" if code.startswith('6') else f"sz.{code}"
    rs = bs.query_history_k_data_plus(
        bs_code,
        "date,open,high,low,close,preclose,volume",
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
        if len(row) == 7:
            date_str = row[0]
            open_p = safe_float(row[1])
            high = safe_float(row[2])
            low = safe_float(row[3])
            close = safe_float(row[4])
            preclose = safe_float(row[5])
            volume = safe_float(row[6])
            if open_p == 0 and high == 0 and low == 0 and close == 0:
                continue
            rows.append({
                'date': date_str,
                'open': open_p,
                'high': high,
                'low': low,
                'close': close,
                'preclose': preclose,
                'volume': volume
            })
    return rows

def save_daily_quote(code, rows):
    """保存日线数据（upsert）"""
    if not rows:
        return 0
    session = get_session('daily_quote')
    inserted = 0
    try:
        for row in rows:
            date_obj = datetime.strptime(row['date'], '%Y-%m-%d').date()
            stmt = text("""
                INSERT OR REPLACE INTO daily_quote 
                (code, date, preclose, open, high, low, close, volume)
                VALUES (:code, :date, :preclose, :open, :high, :low, :close, :volume)
            """)
            session.execute(stmt, {
                'code': code,
                'date': date_obj,
                'preclose': row['preclose'],
                'open': row['open'],
                'high': row['high'],
                'low': row['low'],
                'close': row['close'],
                'volume': row['volume']
            })
            inserted += 1
        session.commit()
        logger.info(f"{code} upsert {inserted} 条日线")
    except Exception as e:
        logger.error(f"{code} 保存失败: {e}")
        session.rollback()
    finally:
        session.close()
    return inserted

def collect_daily_quotes(start_date, end_date, start_code=None, single_code=None):
    """主控函数"""
    session = get_session('stock_list')
    try:
        query = session.query(StockList.code).filter(StockList.board.in_(ALLOWED_BOARDS))
        if single_code:
            query = query.filter(StockList.code == single_code)
            logger.info(f"指定单只股票: {single_code}")
        elif start_code:
            query = query.filter(StockList.code >= start_code)
            logger.info(f"从 {start_code} 开始采集")
        else:
            logger.info("全量采集所有股票")
        codes = [row[0] for row in query.all()]
        total = len(codes)
        if total == 0:
            logger.warning("没有需要采集的股票")
            return
        logger.info(f"共 {total} 只股票，日期 {start_date} ~ {end_date}")
    finally:
        session.close()

    lg = bs.login()
    if lg.error_code != '0':
        logger.error(f"Baostock 登录失败: {lg.error_msg}")
        return

    success = fail = 0
    start_time = time.time()
    try:
        for idx, code in enumerate(codes):
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
            rows = fetch_daily_quote_for_code(code, start_date, end_date)
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
# DataBase/collect_fundamentals.py
"""
统一采集基本面数据（财务指标 + 历史股本）
用法：
    python collect_fundamentals.py                              # 全量采集（默认 2020-01-01 ~ 2026-07-01）
    python collect_fundamentals.py --from 2022-01-01     # 指定起始日期
    python collect_fundamentals.py --to 2025-12-31       # 指定截止日期
    python collect_fundamentals.py --code 000001               # 只采集单只股票
    python collect_fundamentals.py --restart 000300         # 从该代码开始采集
    python collect_fundamentals.py --code 000001 --from 2023-01-01 --to 2024-12-31
"""

import time
import logging
import argparse
import pandas as pd
from bisect import bisect_right
from datetime import datetime
from DataBase import get_session, engines, Base
from Models import Fundamentals, StockList
import akshare as ak

# 建表（若表不存在，自动创建）
Base.metadata.create_all(engines["fundamentals"])

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

REQUEST_INTERVAL = 0.8          # 请求间隔（秒）

# ------------------ 工具函数 ------------------
def safe_get(series, aliases, default=0.0):
    """从 Series 中按别名列表依次查找，返回第一个存在的值，否则返回 default"""
    for alias in aliases:
        if alias in series.index:
            val = series[alias]
            if pd.notna(val):
                return float(val)
    return default

def get_share_history(code: str):
    """
    获取股票全部历史股本变动，返回 (变更日期, 总股本, 已上市流通A股) 列表，按日期升序。
    若失败返回空列表。
    """
    try:
        df = ak.stock_zh_a_gbjg_em(symbol=code)
        if df.empty:
            return []
        df = df[['变更日期', '总股本', '已上市流通A股']].copy()
        df['变更日期'] = pd.to_datetime(df['变更日期']).dt.date
        df = df.sort_values('变更日期').drop_duplicates(subset=['变更日期'])
        history = list(zip(df['变更日期'], df['总股本'].astype(float), df['已上市流通A股'].astype(float)))
        return history
    except Exception as e:
        logger.debug(f"获取 {code} 历史股本失败: {e}")
        return []

def collect_fundamentals_for_code(code: str, start_date, end_date):
    """
    采集单只股票在 [start_date, end_date] 区间内的所有报告期数据，
    返回 Fundamentals 对象列表。
    若某条记录无法匹配股本，则 total_share 和 float_share 设为 0.0。
    """
    # 1. 获取财务指标
    try:
        df = ak.stock_financial_analysis_indicator(symbol=code)
        if df.empty:
            logger.warning(f"股票 {code} 无财务数据")
            return []
    except Exception as e:
        logger.warning(f"股票 {code} 获取财务数据失败: {e}")
        return []

    # 解析报告日期并过滤
    df['report_date'] = pd.to_datetime(df['日期']).dt.date
    df = df[(df['report_date'] >= start_date) & (df['report_date'] <= end_date)]
    if df.empty:
        logger.info(f"股票 {code} 在指定区间内无财务数据")
        return []

    # 2. 获取历史股本
    history = get_share_history(code)
    dates, totals, floats = [], [], []
    if history:
        dates = [h[0] for h in history]
        totals = [h[1] for h in history]
        floats = [h[2] for h in history]

    # 3. 构造对象
    objs = []
    for _, row in df.iterrows():
        report_date = row['report_date']
        # 匹配股本（二分查找）
        total_share = 0.0
        float_share = 0.0
        if dates:
            pos = bisect_right(dates, report_date) - 1
            if pos >= 0:
                total_share = totals[pos]
                float_share = floats[pos]
            else:
                # 报告日期早于所有变更日期，使用第一条（可能是上市前）
                total_share = totals[0] if totals else 0.0
                float_share = floats[0] if floats else 0.0

        data = {
            'code': code,
            'report_date': report_date,
            'eps_diluted': safe_get(row, ['摊薄每股收益(元)'], 0.0),
            'eps_weighted': safe_get(row, ['加权每股收益(元)'], 0.0),
            'eps_adjusted': safe_get(row, ['每股收益_调整后(元)'], 0.0),
            'eps_deduct_nonrecurring': safe_get(row, ['扣除非经常性损益后的每股收益(元)'], 0.0),
            'bps_before_adjust': safe_get(row, ['每股净资产_调整前(元)'], 0.0),
            'bps_after_adjust': safe_get(row, ['每股净资产_调整后(元)'], 0.0),
            'operating_cf_per_share': safe_get(row, ['每股经营性现金流(元)'], 0.0),
            'capital_reserve_per_share': safe_get(row, ['每股资本公积金(元)'], 0.0),
            'retained_earnings_per_share': safe_get(row, ['每股未分配利润(元)'], 0.0),
            'total_assets': safe_get(row, ['总资产(元)'], 0.0),
            'total_assets_growth': safe_get(row, ['总资产增长率(%)'], 0.0),
            'net_assets_growth': safe_get(row, ['净资产增长率(%)'], 0.0),
            'net_profit_deduct_nonrecurring': safe_get(row, ['扣除非经常性损益后的净利润(元)'], 0.0),
            'operating_profit': safe_get(row, ['主营业务利润(元)'], 0.0),
            'non_operating_ratio': safe_get(row, ['非主营比重'], 0.0),
            'net_profit_growth': safe_get(row, ['净利润增长率(%)'], 0.0),
            'debt_to_assets_ratio': safe_get(row, ['资产负债率(%)'], 0.0),
            'equity_ratio': safe_get(row, ['股东权益比率(%)'], 0.0),
            'operating_cf_to_net_profit_ratio': safe_get(row, ['经营现金净流量与净利润的比率(%)'], 0.0),
            'operating_cf_to_liabilities_ratio': safe_get(row, ['经营现金净流量对负债比率(%)'], 0.0),
            'total_share': total_share,
            'float_share': float_share,
        }
        objs.append(Fundamentals(**data))
    return objs

def save_fundamentals(fund_objs, session):
    if not fund_objs:
        return
    code = fund_objs[0].code
    try:
        session.query(Fundamentals).filter(Fundamentals.code == code).delete()
        session.add_all(fund_objs)
        session.commit()
        logger.info(f"✅ 股票 {code} 保存成功，共 {len(fund_objs)} 条记录")
    except Exception as e:
        session.rollback()
        logger.error(f"❌ 保存股票 {code} 失败: {e}")

# ------------------ 主控函数 ------------------
def collect_all_fundamentals(start_date, end_date, start_code=None, single_code=None):
    """
    采集股票列表。
    :param start_date: 报告起始日期
    :param end_date: 报告截止日期
    :param start_code: 从该股票代码开始采集（包含），为 None 时从第一个开始
    :param single_code: 仅采集单只股票，若指定则忽略 start_code
    """
    stock_session = get_session('stock_list')
    try:
        query = stock_session.query(StockList.code).order_by(StockList.code)
        if single_code:
            query = query.filter(StockList.code == single_code)
            logger.info(f"指定单只股票: {single_code}")
        elif start_code:
            query = query.filter(StockList.code >= start_code)
            logger.info(f"从股票代码 {start_code} 开始采集（包含该代码）")
        else:
            logger.info("全量采集所有股票")

        codes = [row.code for row in query.all()]
    finally:
        stock_session.close()

    if not codes:
        logger.warning("没有需要采集的股票")
        return

    logger.info(f"本次共 {len(codes)} 只股票，日期区间: {start_date} ~ {end_date}")
    fund_session = get_session('fundamentals')
    try:
        for idx, code in enumerate(codes, 1):
            logger.info(f"进度: {idx}/{len(codes)} - {code}")
            objs = collect_fundamentals_for_code(code, start_date, end_date)
            if objs:
                save_fundamentals(objs, fund_session)
            else:
                logger.info(f"{code} 无符合条件的数据，跳过")
            time.sleep(REQUEST_INTERVAL)
    finally:
        fund_session.close()
    logger.info("🎉 全部采集完成！")

# ------------------ 命令行入口 ------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='采集股票基本面数据（财务指标 + 历史股本匹配）')
    # 使用 dest 映射到内部属性名
    parser.add_argument('--from', dest='start_date', type=str, default='2020-01-01',
                        help='报告起始日期，格式 yyyy-mm-dd，默认 2020-01-01')
    parser.add_argument('--to', dest='end_date', type=str, default='2026-07-01',
                        help='报告截止日期，格式 yyyy-mm-dd，默认 2026-07-01')
    parser.add_argument('--restart', dest='start_code', type=str, help='从该股票代码开始采集（包含）')
    parser.add_argument('--code', dest='single_code', type=str, help='仅采集单只股票（优先级高于 --restart）')
    args = parser.parse_args()

    # 解析日期
    try:
        start = datetime.strptime(args.start_date, '%Y-%m-%d').date()
        end = datetime.strptime(args.end_date, '%Y-%m-%d').date()
    except ValueError:
        logger.error("日期格式错误，请使用 yyyy-mm-dd 格式")
        exit(1)

    if start > end:
        logger.error("起始日期不能晚于截止日期")
        exit(1)

    collect_all_fundamentals(start, end, args.start_code, args.single_code)
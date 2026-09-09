# DataBase/collect_StockList.py

import sys
import os
import time
import logging
import pandas as pd
from datetime import datetime
from DataBase import Base, engines, get_session
from Models import StockList
import akshare as ak

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 只采集主板、科创板、创业板（按代码前缀判断）
ALLOWED_BOARDS = {'主板', '科创板', '创业板'}

# 在 StockList.db 中创建表（确保表结构包含新增字段）
Base.metadata.create_all(bind=engines["stock_list"])

# 请求间隔（秒），避免被反爬
REQUEST_INTERVAL = 0.3

def get_board_and_market(code: str):
    """
    根据股票代码前缀精准判断板块和市场
    返回 (market, board)
    """
    if code.startswith('6'):
        market = 'SH'
        if code.startswith(('688', '689')):
            board = '科创板'
        else:
            board = '主板'
    elif code.startswith(('000', '001', '002', '003')):
        market = 'SZ'
        board = '主板'
    elif code.startswith(('300', '301')):
        market = 'SZ'
        board = '创业板'
    elif code.startswith('8'):
        market = 'BJ'
        board = '北交所'
    elif code.startswith('4'):
        market = 'SZ'
        board = '老三板'
    else:
        market = 'UNKNOWN'
        board = '其他'
    return market, board

def fetch_and_save_stock_list():
    """
    使用 AkShare 获取全市场股票列表，
    只保留主板、科创板、创业板，
    并调用个股信息接口填充上市日期和行业。
    """
    session = get_session("stock_list")

    try:
        # ----- 第一步：获取所有股票代码和名称 -----
        logger.info("正在从 AkShare 获取全市场股票代码列表...")
        df_code = ak.stock_info_a_code_name()
        if df_code.empty:
            logger.error("未获取到任何股票代码列表，请检查网络或 AkShare 版本。")
            return

        logger.info(f"共获取 {len(df_code)} 只股票，开始筛选及补充详细信息...")

        # ----- 第二步：筛选并逐只获取详情 -----
        stock_list = []
        total = len(df_code)
        for idx, row in df_code.iterrows():
            code = row['code']
            name = row['name'].strip()
            market, board = get_board_and_market(code)

            # 只处理允许的板块
            if board not in ALLOWED_BOARDS:
                continue

            # 调用个股信息接口获取上市日期和行业
            try:
                info = ak.stock_individual_info_em(symbol=code)
                # info 是 DataFrame，列为 ['item', 'value']，转换为 dict
                info_dict = info.set_index('item')['value'].to_dict()
                listed_date_str = info_dict.get('上市时间', '')
                industry = info_dict.get('行业', '')

                # 处理上市日期
                if listed_date_str and len(str(listed_date_str)) == 8:
                    try:
                        listed_date = datetime.strptime(str(listed_date_str), '%Y%m%d').date()
                    except ValueError:
                        listed_date = None
                else:
                    listed_date = None

            except Exception as e:
                logger.warning(f"获取 {code} 个股信息失败: {e}，跳过该股")
                continue

            stock_list.append({
                'code': code,
                'name': name,
                'market': market,
                'board': board,
                'listed_date': listed_date,
                'industry': industry if industry else ''
            })

            # 进度日志
            if (idx + 1) % 100 == 0:
                logger.info(f"进度: {idx+1}/{total}，已筛选出 {len(stock_list)} 只目标股票")

            time.sleep(REQUEST_INTERVAL)  # 间隔

        logger.info(f"筛选完成，共 {len(stock_list)} 只股票（主板+科创板+创业板）")

        if not stock_list:
            logger.warning("未获取到任何符合条件的股票")
            return

        # ----- 第三步：存入数据库（upsert） -----
        count = 0
        for s in stock_list:
            stock = StockList(
                code=s['code'],
                name=s['name'],
                market=s['market'],
                board=s['board'],
                listed_date=s['listed_date'],
                industry=s['industry']
            )
            session.merge(stock)   # 如果存在则更新，否则插入
            count += 1
            if count % 200 == 0:
                session.commit()
                logger.info(f"已保存 {count} 只...")
        session.commit()
        logger.info(f"成功保存 {count} 只股票到 StockList.db")

    except Exception as e:
        logger.error(f"采集股票列表失败: {e}")
        session.rollback()
    finally:
        session.close()

if __name__ == "__main__":
    logger.info("开始使用 AkShare 采集股票列表（仅主板+科创板+创业板）...")
    fetch_and_save_stock_list()
    logger.info("采集完成！")
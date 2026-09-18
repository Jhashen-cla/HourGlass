# DataBase/collect_StockList.py

import os
import sys

# 允许从仓库根目录（python DataBase/collect_StockList.py）
# 或从 DataBase 目录（python collect_StockList.py）两种方式启动
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logging
import argparse
from DataBase import engines, get_session
from DataBase.Models import StockList
import akshare as ak

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 只采集主板、科创板、创业板（按代码前缀判断）
ALLOWED_BOARDS = {'主板', '科创板', '创业板'}

# 只创建本脚本负责的表（不再把 4 张表全建进 StockList.db）
StockList.__table__.create(bind=engines["stock_list"], checkfirst=True)

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

def fetch_and_save_stock_list(single_code=None):
    """
    使用 AkShare 获取全市场股票列表（代码 + 名称），
    只保留主板、科创板、创业板，并写入 StockList.db。
    表结构只有 code / name / market / board 四列。

    不采集上市日期与行业：这两项需要逐股请求东财详情接口，实测该链路不稳定
    （偶发 RemoteDisconnected / 连接被拒），且当前项目并未使用这两个字段。
    将来若确实需要，可改用交易所批量列表接口（ak.stock_info_sh_name_code /
    ak.stock_info_sz_name_code，三次请求即可拿到全市场上市日期）。

    single_code: 只采集指定代码（用于单只修复 / 验证）
    """
    session = get_session("stock_list")

    try:
        # ----- 第一步：获取所有股票代码和名称 -----
        logger.info("正在从 AkShare 获取全市场股票代码列表...")
        df_code = ak.stock_info_a_code_name()
        if df_code.empty:
            logger.error("未获取到任何股票代码列表，请检查网络或 AkShare 版本。")
            return

        if single_code:
            df_code = df_code[df_code['code'].astype(str) == str(single_code)]
            if df_code.empty:
                logger.warning(f"{single_code} 不在 AkShare 返回的代码列表中，跳过")
                return
            logger.info(f"仅采集指定股票: {single_code}")

        logger.info(f"共获取 {len(df_code)} 只股票，开始筛选...")

        # ----- 第二步：按板块筛选 -----
        stock_list = []
        total = len(df_code)
        for idx, row in df_code.iterrows():
            code = str(row['code']).strip()
            name = str(row['name']).strip()
            market, board = get_board_and_market(code)

            # 只处理允许的板块
            if board not in ALLOWED_BOARDS:
                continue

            stock_list.append({
                'code': code,
                'name': name,
                'market': market,
                'board': board,
            })

            # 进度日志
            if (idx + 1) % 1000 == 0:
                logger.info(f"进度: {idx+1}/{total}，已筛选出 {len(stock_list)} 只目标股票")

        logger.info(f"筛选完成，共 {len(stock_list)} 只股票（主板+科创板+创业板）")

        if not stock_list:
            logger.warning("未获取到任何符合条件的股票")
            return

        # ----- 第三步：存入数据库（upsert） -----
        count = 0
        for s in stock_list:
            session.merge(StockList(**s))   # 如果存在则更新，否则插入
            count += 1
            if count % 500 == 0:
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
    parser = argparse.ArgumentParser(description='采集股票列表（仅主板+科创板+创业板）')
    parser.add_argument('--code', dest='single_code', type=str, help='仅采集指定股票代码（用于单只修复/验证）')
    args = parser.parse_args()

    logger.info("开始使用 AkShare 采集股票列表（仅主板+科创板+创业板）...")
    fetch_and_save_stock_list(args.single_code)
    logger.info("采集完成！")

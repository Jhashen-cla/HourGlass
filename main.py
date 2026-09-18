# main.py
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from DataBase.DataBase import SessionLocal
from DataBase.Models import StockList, DailyQuote, Fundamentals, Event
from DataBase import get_session
import json

import tools as tl

app = FastAPI(title="股票数据服务")

# 跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- API 接口 ----------
@app.get("/api/stock_list")
def get_stock_list():
    session = get_session("stock_list")
    try:
        stocks = session.query(StockList).filter(
            StockList.board.in_(['主板', '科创板', '创业板'])
        ).all()
    finally:
        session.close()

    result = [{"code": s.code, "name": s.name} for s in stocks]
    return {"stocks": result}


@app.get("/api/get_kline")
def get_kline(code: str, start: str, end: str):
    code_num = code
    session = SessionLocal()
    try:
        quotes = session.query(DailyQuote).filter(
            DailyQuote.code == code_num,
            DailyQuote.date >= start,
            DailyQuote.date <= end
        ).order_by(DailyQuote.date).all()
        if not quotes:
            return {
                "code": code,
                "start_date": start,
                "end_date": end,
                "kline_data": [],
                "vol_data": [],
                "macd_data": [],
                "kdj_data": [],
                "ma_data": [],
                "fundamentals_data": []
            }
        data_list = []
        for q in quotes:
            data_list.append([
                q.date.strftime("%Y-%m-%d"),
                q.preclose,
                q.open,
                q.high,
                q.low,
                q.close,
                q.volume,
                q.amount,   # 成交额(元)
                q.turn      # 换手率(%)
            ])
    finally:
        session.close()

    kline_data = []
    vol_data = []
    close_raw = []
    for row in data_list:
        date = row[0]
        preclose = float(row[1])
        open_p = float(row[2])
        high = float(row[3])
        low = float(row[4])
        close = float(row[5])
        volume = float(row[6])
        amount = float(row[7] or 0)
        turn = float(row[8] or 0)
        close_raw.append(close)
        kline_data.append({
            "date": date,
            "preclose": preclose,
            "open": open_p,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
            "amount": amount,
            "turn": turn
        })
        vol_data.append({
            "time": date,
            "value": volume
        })
    ma5_arr = tl.calc_ma(close_raw, 5)
    ma10_arr = tl.calc_ma(close_raw, 10)
    ma20_arr = tl.calc_ma(close_raw, 20)
    ma30_arr = tl.calc_ma(close_raw, 30)
    ma_data = []
    for idx, item in enumerate(kline_data):
        ma_data.append({
            "time": item["date"],
            "ma5": ma5_arr[idx],
            "ma10": ma10_arr[idx],
            "ma20": ma20_arr[idx],
            "ma30": ma30_arr[idx]
        })
    macd_data = tl.calc_macd(data_list)
    kdj_data = tl.calc_kdj(data_list)

    # ---------- 获取基本面数据（全部历史，截止到 end） ----------
    fund_session = get_session("fundamentals")
    fund_data = []
    try:
        fund_records = fund_session.query(Fundamentals).filter(
            Fundamentals.code == code_num,
            Fundamentals.report_date <= end
        ).order_by(Fundamentals.report_date).all()
    finally:
        fund_session.close()

    for r in fund_records:
        fund_data.append({
            "report_date": r.report_date.strftime("%Y-%m-%d"),
            "eps_diluted": r.eps_diluted,
            "eps_weighted": r.eps_weighted,
            "eps_adjusted": r.eps_adjusted,
            "eps_deduct_nonrecurring": r.eps_deduct_nonrecurring,
            "bps_before_adjust": r.bps_before_adjust,
            "bps_after_adjust": r.bps_after_adjust,
            "operating_cf_per_share": r.operating_cf_per_share,
            "capital_reserve_per_share": r.capital_reserve_per_share,
            "retained_earnings_per_share": r.retained_earnings_per_share,
            "total_assets": r.total_assets,
            "total_assets_growth": r.total_assets_growth,
            "net_assets_growth": r.net_assets_growth,
            "net_profit_deduct_nonrecurring": r.net_profit_deduct_nonrecurring,
            "operating_profit": r.operating_profit,
            "non_operating_ratio": r.non_operating_ratio,
            "net_profit_growth": r.net_profit_growth,
            "debt_to_assets_ratio": r.debt_to_assets_ratio,
            "equity_ratio": r.equity_ratio,
            "operating_cf_to_net_profit_ratio": r.operating_cf_to_net_profit_ratio,
            "operating_cf_to_liabilities_ratio": r.operating_cf_to_liabilities_ratio,
            "total_share": r.total_share,
            "float_share": r.float_share,
        })

    return {
        "code": code,
        "start_date": start,
        "end_date": end,
        "kline_data": kline_data,
        "vol_data": vol_data,
        "macd_data": macd_data,
        "kdj_data": kdj_data,
        "ma_data": ma_data,
        "fundamentals_data": fund_data
    }

@app.get("/api/events/list")
def get_events():
    """返回所有激活的事件"""
    session = get_session("events")
    try:
        events = session.query(Event).filter(Event.active == True).all()
        result = []
        for e in events:
            result.append({
                "id": e.id,
                "title": e.title,
                "description": e.description,
                "image": e.image or "",
                "options": json.loads(e.options) if e.options else [],
                "condition_type": e.condition_type,
                "condition_value": e.condition_value,
                "trigger_once": e.trigger_once
            })
        return {"events": result}
    finally:
        session.close()

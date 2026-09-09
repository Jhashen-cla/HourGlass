from sqlalchemy import Column, String, Float, Integer, Date, Boolean, UniqueConstraint
from DataBase import Base

# ---------- 表1：股票列表（含板块信息） ----------
class StockList(Base):
    __tablename__ = "stock_list"
    
    code = Column(String(10), primary_key=True, index=True)
    name = Column(String(50), nullable=True)
    market = Column(String(10), nullable=True)   # 'SH', 'SZ', 'BJ'
    board = Column(String(20), nullable=True)    # '主板', '创业板', '科创板', '北交所', '老三板', '其他'

    # listed_date = Column(Date, nullable=True)    # 上市日期
    # industry = Column(String(50), nullable=True) # 所属行业

# ---------- 表2：日线数据（只存原始 OHLCV + 前收盘 + 成交量） ----------
class DailyQuote(Base):
    __tablename__ = "daily_quote"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), index=True, nullable=False)
    date = Column(Date, nullable=False)
    
    preclose = Column(Float, default=0.0)   # 昨日收盘价
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, nullable=False)
    
    __table_args__ = (UniqueConstraint('code', 'date', name='uq_quote_code_date'),)

# ---------- 表3：基本面  ----------

class Fundamentals(Base):
    __tablename__ = "fundamentals"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), index=True, nullable=False)
    report_date = Column(Date, nullable=False)

    # ---------- 财务指标（全部保留，不变） ----------
    eps_diluted = Column(Float, default=0.0)
    eps_weighted = Column(Float, default=0.0)
    eps_adjusted = Column(Float, default=0.0)
    eps_deduct_nonrecurring = Column(Float, default=0.0)
    bps_before_adjust = Column(Float, default=0.0)
    bps_after_adjust = Column(Float, default=0.0)
    operating_cf_per_share = Column(Float, default=0.0)
    capital_reserve_per_share = Column(Float, default=0.0)
    retained_earnings_per_share = Column(Float, default=0.0)

    total_assets = Column(Float, default=0.0)
    total_assets_growth = Column(Float, default=0.0)
    net_assets_growth = Column(Float, default=0.0)
    net_profit_deduct_nonrecurring = Column(Float, default=0.0)
    operating_profit = Column(Float, default=0.0)
    non_operating_ratio = Column(Float, default=0.0)
    net_profit_growth = Column(Float, default=0.0)
    debt_to_assets_ratio = Column(Float, default=0.0)
    equity_ratio = Column(Float, default=0.0)
    operating_cf_to_net_profit_ratio = Column(Float, default=0.0)
    operating_cf_to_liabilities_ratio = Column(Float, default=0.0)
    total_share = Column(Float, default=0.0)
    float_share = Column(Float, default=0.0)

    __table_args__ = (UniqueConstraint('code', 'report_date', name='uq_fund_code_date'),)

from sqlalchemy import Column, String, Float, Integer, Date, UniqueConstraint, DateTime, Boolean
from datetime import datetime
from DataBase import Base

# ---------- 表4：事件表 ----------
class Event(Base):
    __tablename__ = "events"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)                # 事件标题
    description = Column(String(1000), nullable=False)         # 事件详情
    image = Column(String(200), nullable=True)                 # 图标：emoji 或图片 URL
    options = Column(String(2000), nullable=True)              # JSON 选项列表
    active = Column(Boolean, default=True)                     # 是否启用
    condition_type = Column(String(30), nullable=False)        # 条件类型
    condition_value = Column(String(200), nullable=True)       # 条件参数（逗号分割）
    trigger_once = Column(Boolean, default=False)              # 是否只触发一次
    created_at = Column(Date, default=datetime.now().date())   # 创建日期（自动记录）
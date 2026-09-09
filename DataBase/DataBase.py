import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, "db")
os.makedirs(DB_DIR, exist_ok=True)

# 数据库文件路径映射
DB_PATHS = {
    "stock_list": os.path.join(DB_DIR, "StockList.db"),
    "daily_quote": os.path.join(DB_DIR, "DateData.db"),
    "fundamentals": os.path.join(DB_DIR, "Fundamentals.db"),
    "events": os.path.join(DB_DIR, "Events.db"),   
}

# 创建所有引擎
engines = {
    name: create_engine(
        f"sqlite:///{path}",
        connect_args={"check_same_thread": False},
        echo=False
    )
    for name, path in DB_PATHS.items()
}

# 创建所有会话工厂
session_factories = {
    name: sessionmaker(autocommit=False, autoflush=False, bind=engine)
    for name, engine in engines.items()
}

# 默认会话（日线数据库，保持兼容）
SessionLocal = session_factories["daily_quote"]

# ORM 基类
Base = declarative_base()

# 获取指定数据库的会话（采集脚本使用）
def get_session(db_name: str):
    """返回指定数据库的会话实例"""
    return session_factories[db_name]()

# 依赖注入（FastAPI 用，默认日线）
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
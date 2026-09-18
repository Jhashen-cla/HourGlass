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

# ---------- 结构自愈：为老数据库补上模型新增的列 ----------
# *.db 不入库（见 .gitignore），老库可能是由更早版本的模型生成的。
# 模型一旦声明新列，任何 ORM 查询都会生成带新列的 SELECT，
# 老库缺列会直接抛 "no such column"，所以这里在导入时统一补齐。
# 注：SQLite 的 ADD COLUMN 只改元数据，747 万行的表也是秒级完成。
REQUIRED_COLUMNS = {
    "daily_quote": {
        "amount": "FLOAT",   # 成交额(元)
        "turn": "FLOAT",     # 换手率(%)
    },
}

def ensure_columns():
    """为所有已存在的库补上 REQUIRED_COLUMNS 中缺失的列（幂等，不重建、不动数据）"""
    for table_name, columns in REQUIRED_COLUMNS.items():
        for engine in engines.values():
            with engine.begin() as conn:
                exists = conn.exec_driver_sql(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
                    (table_name,),
                ).fetchone()
                if not exists:
                    continue  # 表还不存在，建表时会带上新列
                present = {
                    row[1]
                    for row in conn.exec_driver_sql('PRAGMA table_info("%s")' % table_name)
                }
                for column, ddl_type in columns.items():
                    if column not in present:
                        conn.exec_driver_sql(
                            'ALTER TABLE "%s" ADD COLUMN %s %s'
                            % (table_name, column, ddl_type)
                        )
                        print(f"[DataBase] 已为 {table_name} 补列: {column} {ddl_type}")

ensure_columns()

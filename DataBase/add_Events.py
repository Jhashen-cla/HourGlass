# DataBase/add_Events.py
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from DataBase import get_session, engines, Base
from DataBase.Models import Event
from datetime import datetime

Base.metadata.create_all(bind=engines["events"])

def add_event(
    title: str,
    description: str,
    condition_type: str,
    condition_value: str = "",
    image: str = "📌",
    options: list = None,
    active: bool = True,
    trigger_once: bool = False
):
    """
    通用函数：向 events 表插入一条事件记录。
    """
    if options is None:
        options = [{"text": "知道了", "action": "ignore"}]
    import json
    options_json = json.dumps(options, ensure_ascii=False)
    session = get_session("events")
    try:
        event = Event(
            title=title,
            description=description,
            image=image,
            options=options_json,
            active=active,
            condition_type=condition_type,
            condition_value=condition_value,
            trigger_once=trigger_once,
            created_at=datetime.now().date()
        )
        session.add(event)
        session.commit()
        print(f"✅ 事件添加成功，ID: {event.id}")
        return event.id
    except Exception as e:
        print(f"❌ 添加事件失败: {e}")
        session.rollback()
        return None
    finally:
        session.close()

if __name__ == "__main__":
    # 示例：添加一个 dividend 事件（如果不存在则添加）
    # 先检查是否已存在，避免重复插入（根据 condition_type 判断）
    session = get_session("events")
    existing = session.query(Event).filter(Event.condition_type == "dividend").first()
    session.close()
    if not existing:
        add_event(
            title="除权除息",
            description="您持有的股票今天分红啦!\n已根据您的持仓给予资金补偿",
            condition_type="dividend",
            condition_value="",
            image="💎",
            options=[{"text": "知道了", "action": "ignore"}]
        )
    else:
        print("dividend 事件已存在，跳过添加。")
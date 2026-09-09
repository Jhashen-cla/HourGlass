// JavaScirpt/events.js
import { state } from './state.js';
import { showEventPanel } from './ui.js';

let eventsCache = [];
let triggeredEvents = new Set();  // 记录已触发的事件ID（用于 trigger_once）

// ---------- 加载事件列表 ----------
export async function loadEvents() {
    try {
        const res = await fetch('http://127.0.0.1:8000/api/events/list');
        const json = await res.json();
        eventsCache = json.events || [];
        console.log(`加载 ${eventsCache.length} 个事件`);
    } catch (e) {
        console.warn('加载事件失败', e);
        eventsCache = [];
    }
}

// ---------- 事件处理器映射表 ----------
const eventHandlers = {
    /**
     * 除权除息补偿事件
     * 检测当前日期的 close 是否等于下一日的 preclose，不等则发生除权除息。
     * 补偿金额 = (当日收盘价 - 下一日开盘价) × 持仓股数
     */
    'dividend': (params, context) => {
        // params: condition_value 用逗号分割的参数（本例不需要）
        // context: { date, price, preclose, close, volume, holdings, cash, code, ... }
        const idx = state.displayIndex;
        if (idx <= 0 || idx >= state.fullDataCache.length - 1) return false;
        const current = state.fullDataCache[idx];
        const next = state.fullDataCache[idx + 1];
        if (!current || !next) return false;
        if (next.preclose === current.close) return false;
        const shares = state.shares;
        if (shares === 0) return false;

        const compensationPerShare = current.close - next.preclose;
        const totalCompensation = compensationPerShare * shares;
        state.cash += totalCompensation;
        state.totalInvest = Math.max(0, state.totalInvest - totalCompensation);
        if (state.shares > 0) {
            state.cost = state.totalInvest / state.shares;
        }

        context._dividend_info = {
            compensation: totalCompensation,
            perShare: compensationPerShare,
            shares: shares,
            prevClose: current.close,
            open: next.open,
            preclose: next.preclose
        };
        return true;
    },

    // 可在此继续添加其他事件处理器，例如：
    // 'date': (params, context) => { ... },
    // 'price_change': (params, context) => { ... },
    // ...
};

// ---------- 检查事件（每次尾盘调用） ----------
export function checkEvents(context) {
    if (eventsCache.length === 0) return;

    for (const evt of eventsCache) {
        // 如果已经触发过且是一次性事件，跳过
        if (evt.trigger_once && triggeredEvents.has(evt.id)) continue;

        const handler = eventHandlers[evt.condition_type];
        if (!handler) {
            console.warn(`未知事件类型: ${evt.condition_type}`);
            continue;
        }

        // 分割 condition_value 作为参数数组
        const params = evt.condition_value ? evt.condition_value.split(',') : [];

        // 调用处理器，获取触发结果
        const triggered = handler(params, context);

        if (triggered) {
            // 构建事件数据，可包含动态信息
            let eventData = evt;
            // 如果是 dividend 事件，增强描述
            if (evt.condition_type === 'dividend' && context._dividend_info) {
                const info = context._dividend_info;
                eventData = {
                    ...evt,
                    description: evt.description + 
                        `\n补偿金额：${info.compensation.toFixed(2)} 元（每股 ${info.perShare.toFixed(4)} 元 × ${info.shares} 股）`
                };
            }
            showEventPanel(eventData);
            if (evt.trigger_once) {
                triggeredEvents.add(evt.id);
                // 可选：调用后端标记已触发
                // fetch('/api/events/mark_triggered', { method: 'POST', body: JSON.stringify({id: evt.id}) });
            }
            break; // 每次只触发一个事件（按优先级可调整）
        }
    }
}
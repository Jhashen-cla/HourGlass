// trading.js
import { state } from './state.js';
import { calcCommission, calcStamp } from './utils.js';
import { renderChart } from './chartCore.js';
import { updatePortfolioUI } from './ui.js';

export function executeTrade(type, sharesInput) {
    if (state.displayIndex < 0 || state.displayIndex >= state.fullDataCache.length) {
        alert('请先加载数据');
        return;
    }
    const item = state.fullDataCache[state.displayIndex];
    let price;
    if (state.currentState === 'morning') price = item.open;
    else price = item.close;

    if (isNaN(sharesInput) || sharesInput <= 0 || sharesInput % 100 !== 0) {
        alert('请输入100整数倍的正数股数');
        return;
    }
    const qty = parseInt(sharesInput);
    const date = item.date;

    if (type === 'buy') {
        const amount = price * qty;
        const commission = calcCommission(amount);
        const totalCost = amount + commission;
        if (totalCost > state.cash) {
            alert(`资金不足！需要 ${totalCost.toFixed(2)}，可用 ${state.cash.toFixed(2)}`);
            return;
        }
        state.cash -= totalCost;
        state.totalInvest += totalCost;
        state.shares += qty;
        state.todayBuyShares += qty;

        // 更新交易标记（按日期）
        if (!state.transactions[date]) {
            state.transactions[date] = { buy: false, sell: false, active: true };
        }
        state.transactions[date].buy = true;

        if (state.shares > 0) {
            state.cost = state.totalInvest / state.shares;
        }
        afterTrade();
    } else if (type === 'sell') {
        const available = state.shares - state.todayBuyShares;
        if (qty > available) {
            alert(`可卖股数不足！当前可卖 ${available} 股（T+1规则：今日买入不可卖）`);
            return;
        }
        const amount = price * qty;
        const commission = calcCommission(amount);
        const stamp = calcStamp(amount);
        const netIncome = amount - commission - stamp;
        state.cash += netIncome;
        state.totalInvest -= netIncome;
        state.shares -= qty;

        // 更新交易标记（按日期）
        if (!state.transactions[date]) {
            state.transactions[date] = { buy: false, sell: false, active: true };
        }
        state.transactions[date].sell = true;

        if (state.shares === 0) {
            // 清仓：将所有日期的 active 设为 false
            for (const key in state.transactions) {
                state.transactions[key].active = false;
            }
            // 重置相关状态
            state.totalInvest = 0;
            state.cost = 0;
            state.todayBuyShares = 0;
        } else {
            state.cost = state.totalInvest / state.shares;
        }
        afterTrade();
    }
}

function afterTrade() {
    updatePortfolioUI();
    renderChart(state.displayIndex, { preserveView: true, fitContent: false });
}
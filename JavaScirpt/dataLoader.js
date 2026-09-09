// ============================================================
//  数据加载（K线、基本面、股票列表）- 使用 state
// ============================================================
import { state } from './state.js';
import { renderChart, initChart } from './chartCore.js';
import {
    fillInfoBar, updateRangeInfo, updateUIState, updatePortfolioUI,
    updateStatus, updateTopPrice, resetInfoBar
} from './ui.js';

// ---------- 加载股票列表 ----------
let stockListData = [];
export async function loadStockList() {
    try {
        const res = await fetch('http://127.0.0.1:8000/api/stock_list');
        const json = await res.json();
        stockListData = json.stocks || [];
        console.log(`加载 ${stockListData.length} 只股票`);
        return stockListData;
    } catch (e) {
        console.warn('加载股票列表失败', e);
        stockListData = [];
        return [];
    }
}
export { stockListData };

// ---------- 加载K线和基本面 ----------
export async function loadData(code, start, end, currentDateParam, capital) {
    resetInfoBar();
    updateTopPrice();
    updateStatus('⏳ 加载中...', 'loading');
    // 重置交易状态
    state.cash = capital;
    state.yesterdayTotalAsset = capital
    state.shares = 0;
    state.totalInvest = 0;
    state.cost = 0;
    state.transactions = {};
    state.todayBuyShares = 0;
    state.currentDate = currentDateParam;
    document.getElementById('currentPrice').textContent = '--';
    document.getElementById('currentPrice').style.color = '#1e293b';

    try {
        const url = `http://127.0.0.1:8000/api/get_kline?code=${encodeURIComponent(code)}&start=${start}&end=${end}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const list = json.kline_data || [];
        if (!list.length) {
            updateStatus('⚠️ 无数据', 'err');
            state.fullDataCache = [];
            state.displayIndex = -1;
            updateRangeInfo();
            updateUIState();
            updatePortfolioUI();
            return false;
        }

        const macdArr = json.macd_data || [];
        const kdjArr = json.kdj_data || [];
        const maArr = json.ma_data || [];
        const enriched = list.map((item, idx) => {
            const macd = macdArr[idx] || {};
            const kdj = kdjArr[idx] || {};
            const ma = maArr[idx] || {};
            return {
                ...item,
                macd_bar: macd.bar ?? 0,
                macd_dif: macd.dif ?? 0,
                macd_dea: macd.dea ?? 0,
                kdj_k: kdj.k ?? 50,
                kdj_d: kdj.d ?? 50,
                kdj_j: kdj.j ?? 50,
                ma5: ma.ma5 ?? 0,
                ma10: ma.ma10 ?? 0,
                ma20: ma.ma20 ?? 0,
                ma30: ma.ma30 ?? 0,
            };
        });

        state.fullDataCache = enriched;
        updateRangeInfo();

        // 基本面
        const fundData = json.fundamentals_data || [];
        state.fundamentalsCache = fundData;
        state.epsList = fundData.map(d => d.eps_deduct_nonrecurring).filter(v => v !== undefined && v !== null);
        if (fundData.length > 0) {
            state.latestFloatShare = fundData[fundData.length - 1].float_share || 0;
        }

        let targetIdx = 0;
        for (let i = 0; i < state.fullDataCache.length; i++) {
            if (state.fullDataCache[i].date <= state.currentDate) targetIdx = i;
            else break;
        }
        if (state.fullDataCache.length > 0 && state.fullDataCache[0].date > state.currentDate) targetIdx = 0;
        state.displayIndex = targetIdx;
        state.currentState = 'afternoon';

        renderChart(state.displayIndex, { fitContent: true, preserveView: false });
        updateUIState();

        if (state.displayIndex >= 0 && state.displayIndex < state.fullDataCache.length) {
            fillInfoBar(state.fullDataCache[state.displayIndex], false);
        }

        document.getElementById('displayCode').textContent = code;
        updateStatus('✅ 就绪', 'ok');
        updatePortfolioUI();
        return true;

    } catch (err) {
        console.error(err);
        updateStatus('❌ 加载失败', 'err');
        alert('数据加载失败，请确认后端服务已启动 (127.0.0.1:8000)');
        return false;
    }
}
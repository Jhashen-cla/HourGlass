// ============================================================
//  按钮事件、拖拽、搜索下拉等交互（使用 state）
// ============================================================
import { state } from './state.js';
import { findIndexByDate } from './utils.js';
import { renderChart, initChart, refreshHighLowMarkers } from './chartCore.js';
import {
    fillInfoBar, updateUIState, updateTopPrice, updatePortfolioUI,
    resetInfoBar, showFundamentals, makeDraggableElement
} from './ui.js';
import { loadData, loadStockList, stockListData } from './dataLoader.js';
import { checkEvents } from './events.js';
import { executeTrade } from './trading.js';

// ---------- 股票搜索下拉 ----------
let selectedStockCode = '';

function filterStocks(keyword) {
    if (!keyword || keyword.trim() === '') return [];
    const kw = keyword.trim().toLowerCase();
    const matches = stockListData.filter(item => {
        const code = item.code.toLowerCase();
        const name = item.name.toLowerCase();
        return code.startsWith(kw) || name.includes(kw);
    });
    matches.sort((a, b) => {
        const aCode = a.code.toLowerCase().startsWith(kw);
        const bCode = b.code.toLowerCase().startsWith(kw);
        if (aCode && !bCode) return -1;
        if (!aCode && bCode) return 1;
        return 0;
    });
    return matches.slice(0, 1024);
}

function renderDropdown(items) {
    const dropdown = document.getElementById('searchDropdown');
    dropdown.innerHTML = '';
    if (items.length === 0) {
        dropdown.classList.remove('active');
        return;
    }
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'search-dropdown-item';
        div.innerHTML = `
            <span class="code">${item.code}</span>
            <span class="name">${item.name}</span>
        `;
        div.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectStock(item.code, item.name);
        });
        dropdown.appendChild(div);
    });
    dropdown.classList.add('active');
}

function selectStock(code, name) {
    const input = document.getElementById('loginCode');
    const nameDisplay = document.getElementById('stockNameDisplay');
    input.value = code;
    nameDisplay.textContent = name;
    selectedStockCode = code;
    document.getElementById('searchDropdown').classList.remove('active');
    input.dispatchEvent(new Event('input'));
}

export function handleSearchInput(e) {
    const input = e.target;
    const value = input.value.trim();
    const nameDisplay = document.getElementById('stockNameDisplay');
    if (value === '') {
        nameDisplay.textContent = '';
        selectedStockCode = '';
        document.getElementById('searchDropdown').classList.remove('active');
        return;
    }
    const exactMatch = stockListData.find(item => item.code === value);
    if (exactMatch) {
        nameDisplay.textContent = exactMatch.name;
        selectedStockCode = value;
        document.getElementById('searchDropdown').classList.remove('active');
        return;
    }
    const results = filterStocks(value);
    if (results.length > 0) {
        renderDropdown(results);
    } else {
        document.getElementById('searchDropdown').classList.remove('active');
    }
}

// ---------- 早盘/尾盘按钮 ----------
export function onMorning() {
    if (state.currentState === 'morning') return;
    if (state.displayIndex >= state.fullDataCache.length - 1) return;

    const oldDay = state.fullDataCache[state.displayIndex];
    const context = {
        date: oldDay.date,
        price: (state.currentState === 'morning' ? oldDay.open : oldDay.close),
        preclose: oldDay.preclose,
        close: oldDay.close,
        volume: oldDay.volume,
        holdings: state.shares,
        cash: state.cash,
        code: document.getElementById('displayCode').textContent,
    };
    checkEvents(context);

    let currentPrice = state.fullDataCache[state.displayIndex].close;
    const oldDate = state.fullDataCache[state.displayIndex]?.date;
    const oldRange = state.chart ? state.chart.timeScale().getVisibleRange() : null;
    const oldLatestDate = state.fullDataCache[state.displayIndex].date;
    state.yesterdayTotalAsset = state.cash + state.shares * currentPrice;

    state.displayIndex++;
    state.currentState = 'morning';

    renderChart(state.displayIndex, { fitContent: false, preserveView: false });

    if (oldRange) {
        const { from, to } = oldRange;
        if (to && to >= oldLatestDate) {
            const fromIdx = findIndexByDate(state.fullDataCache, from);
            const toIdx = findIndexByDate(state.fullDataCache, to);
            if (fromIdx !== -1 && toIdx !== -1) {
                const newFromIdx = Math.min(fromIdx + 1, state.displayIndex);
                const newToIdx = Math.min(toIdx + 1, state.displayIndex);
                const newFrom = state.fullDataCache[newFromIdx].date;
                const newTo = state.fullDataCache[newToIdx].date;
                setTimeout(() => {
                    state.chart.timeScale().setVisibleRange({ from: newFrom, to: newTo });
                    state.savedTimeRange = state.chart.timeScale().getVisibleRange();
                    refreshHighLowMarkers();
                }, 40);
            } else {
                setTimeout(() => refreshHighLowMarkers(), 40);
            }
        } else {
            setTimeout(() => refreshHighLowMarkers(), 40);
        }
    } else {
        setTimeout(() => refreshHighLowMarkers(), 40);
    }

    const newDate = state.fullDataCache[state.displayIndex]?.date;
    if (newDate !== oldDate) {
        state.todayBuyShares = 0;
    }

    const currentItem = state.fullDataCache[state.displayIndex];
    if (currentItem) fillInfoBar(currentItem, false);
    updateUIState();
    updateTopPrice();
    updatePortfolioUI();
}

export function onAfternoon() {
    if (state.currentState === 'morning') {
        state.currentState = 'afternoon';
        renderChart(state.displayIndex, { fitContent: false, preserveView: true });
    } else {

        if (state.displayIndex >= state.fullDataCache.length - 1) return;
        
        const oldDay = state.fullDataCache[state.displayIndex];
        const oldDate = oldDay.date;
        const context = {
            date: oldDay.date,
            price: (state.currentState === 'morning' ? oldDay.open : oldDay.close),
            preclose: oldDay.preclose,
            close: oldDay.close,
            volume: oldDay.volume,
            holdings: state.shares,
            cash: state.cash,
            code: document.getElementById('displayCode').textContent,
        };
        checkEvents(context);
        
        let currentPrice = state.fullDataCache[state.displayIndex].close;
        const oldRange = state.chart ? state.chart.timeScale().getVisibleRange() : null;
        const oldLatestDate = state.fullDataCache[state.displayIndex].date;
        state.yesterdayTotalAsset = state.cash + state.shares * currentPrice;
        
        state.displayIndex++;
        state.currentState = 'afternoon';

        renderChart(state.displayIndex, { fitContent: false, preserveView: false });

        if (oldRange) {
            const { from, to } = oldRange;
            if (to && to >= oldLatestDate) {
                const fromIdx = findIndexByDate(state.fullDataCache, from);
                const toIdx = findIndexByDate(state.fullDataCache, to);
                if (fromIdx !== -1 && toIdx !== -1) {
                    const newFromIdx = Math.min(fromIdx + 1, state.displayIndex);
                    const newToIdx = Math.min(toIdx + 1, state.displayIndex);
                    const newFrom = state.fullDataCache[newFromIdx].date;
                    const newTo = state.fullDataCache[newToIdx].date;
                    setTimeout(() => {
                        state.chart.timeScale().setVisibleRange({ from: newFrom, to: newTo });
                        state.savedTimeRange = state.chart.timeScale().getVisibleRange();
                        refreshHighLowMarkers();
                    }, 40);
                } else {
                    setTimeout(() => refreshHighLowMarkers(), 40);
                }
            } else {
                setTimeout(() => refreshHighLowMarkers(), 40);
            }
        } else {
            setTimeout(() => refreshHighLowMarkers(), 40);
        }

        const newDate = state.fullDataCache[state.displayIndex]?.date;
        if (newDate !== oldDate) {
            state.todayBuyShares = 0;
        }
    }
    
    const item = state.fullDataCache[state.displayIndex];
    if (item) fillInfoBar(item, false);
    updateUIState();
    updateTopPrice();
    updatePortfolioUI();
}

// ---------- 切换指标 / 均线 ----------
export function switchIndicator(indicator) {
    if (indicator === state.currentIndicator && state.fullDataCache.length > 0) return;
    state.currentIndicator = indicator;
    if (state.displayIndex >= 0 && state.fullDataCache.length > 0) {
        renderChart(state.displayIndex, { preserveView: true, fitContent: false });
    }
}

export function toggleMaShow() {
    state.showMa = document.getElementById('showMaCheck').checked;
    if (state.displayIndex >= 0 && state.fullDataCache.length > 0) {
        renderChart(state.displayIndex, { preserveView: true, fitContent: false });
    }
}

// ---------- 交易面板拖拽 ----------
export function makeDraggable() {
    const panel = document.getElementById('tradePanel');
    const title = document.getElementById('panelTitle');
    let offsetX = 0, offsetY = 0, isDragging = false;

    title.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.close-btn')) return;
        isDragging = true;
        const rect = panel.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        panel.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        let left = e.clientX - offsetX;
        let top = e.clientY - offsetY;
        left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, left));
        top = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, top));
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            panel.style.cursor = 'default';
            document.body.style.userSelect = '';
        }
    });
}

// ---------- 交易面板逻辑 ----------
let currentTradeTab = 'buy';

function initTradePanel() {
    const tabs = document.querySelectorAll('.trade-tab');
    const input = document.getElementById('tradeSharesInput');
    const confirmBtn = document.getElementById('tradeConfirmBtn');
    const quickBtns = document.querySelectorAll('.quick-btn');

    // 标签切换
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentTradeTab = this.dataset.tab;
            updateTradeConfirmText();
            updateSharesHint();
            // 切换时自动计算满仓对应的手数
            calculateAndSetShares(1);
        });
    });

    // 输入框事件（输入手数）
    input.addEventListener('input', function() {
        updateSharesHint();
    });

    // 快速仓位按钮（传入小数）
    quickBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const fraction = parseFloat(this.dataset.fraction);
            calculateAndSetShares(fraction);
        });
    });

    // 确认按钮
    confirmBtn.addEventListener('click', function() {
        const lots = parseInt(input.value);
        if (isNaN(lots) || lots <= 0) {
            alert('请输入正整数手数');
            return;
        }
        const shares = lots * 100;
        executeTrade(currentTradeTab, shares);
    });
    
    const rulesBtn = document.getElementById('tradeRulesBtn');
    const rulesModal = document.getElementById('tradeRulesModal');
    const closeRulesBtn = document.getElementById('closeRulesModal');

    if (rulesBtn && rulesModal) {
        rulesBtn.addEventListener('click', () => {
            rulesModal.style.display = 'flex';
        });
        closeRulesBtn.addEventListener('click', () => {
            rulesModal.style.display = 'none';
        });
        // 点击模态背景关闭
        rulesModal.addEventListener('click', (e) => {
            if (e.target === rulesModal) {
                rulesModal.style.display = 'none';
            }
        });
    }
    // 初始显示
    updateTradeConfirmText();
    updateSharesHint();
}

function updateTradeConfirmText() {
    const btn = document.getElementById('tradeConfirmBtn');
    btn.textContent = currentTradeTab === 'buy' ? '确认买入' : '确认卖出';
}

function updateSharesHint() {
    const input = document.getElementById('tradeSharesInput');
    const hint = document.getElementById('tradeSharesHint');
    const lots = parseInt(input.value) || 0;
    const shares = lots * 100;
    hint.textContent = shares > 0 ? `${shares}股` : '0股';
}

function calculateAndSetShares(fraction) {
    const price = parseFloat(document.getElementById('tradeCurrentPrice').textContent) || 0;
    if (price <= 0) {
        alert('当前价格无效');
        return;
    }
    let maxShares = 0;
    if (currentTradeTab === 'buy') {
        const cash = state.cash;
        const commissionRate = 0.0003;
        const minCommission = 5;
        let maxByCash = Math.floor(cash / price);
        for (let qty = maxByCash; qty > 0; qty -= 100) {
            const amount = qty * price;
            const commission = Math.max(amount * commissionRate, minCommission);
            if (amount + commission <= cash) {
                maxShares = qty;
                break;
            }
        }
    } else {
        const available = state.shares - state.todayBuyShares;
        maxShares = Math.max(0, available);
    }
    const targetShares = Math.floor(maxShares * fraction / 100) * 100;
    const targetLots = targetShares / 100;
    const input = document.getElementById('tradeSharesInput');
    input.value = Math.max(0, targetLots);
    updateSharesHint();
}

// ---------- 登录/初始化 ----------
export function initApp() {
    const code = document.getElementById('loginCode').value.trim();
    const start = document.getElementById('loginStart').value;
    const end = document.getElementById('loginEnd').value;
    let current = document.getElementById('loginCurrent').value;
    const capital = parseFloat(document.getElementById('loginCapital').value) || 100000;

    if (!code || !start || !end || !current) {
        alert('请完整填写所有参数');
        return;
    }
    if (start > end) {
        alert('起始日期不能晚于截止日期');
        return;
    }
    if (current < start) current = start;
    if (current > end) current = end;

    document.getElementById('loginOverlay').classList.add('hidden');
    const mainApp = document.getElementById('mainApp');
    mainApp.classList.add('active');

    initChart();

    loadData(code, start, end, current, capital).then(ok => {
        if (!ok) {
            document.getElementById('loginOverlay').classList.remove('hidden');
            mainApp.classList.remove('active');
        }
        // 数据加载完成后，初始化交易面板
        initTradePanel();
    });
}
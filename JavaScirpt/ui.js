// ============================================================
//  UI 更新函数（全部使用 state）
// ============================================================
import { state } from './state.js';
import { formatVol, getCSSColor } from './utils.js';

// ---------- 信息栏 ----------
export function resetInfoBar() {
    document.getElementById('infoOpen').textContent = '--';
    document.getElementById('infoHigh').textContent = '--';
    document.getElementById('infoLow').textContent = '--';
    document.getElementById('infoClose').textContent = '--';
    document.getElementById('infoVol').textContent = '--';
    document.getElementById('infoChg').textContent = '--';
    document.getElementById('infoDate').textContent = '--';
    document.getElementById('infoTurnover').textContent = '--';
    document.getElementById('infoAmplitude').textContent = '--';
    document.getElementById('infoPeTTM').textContent = '--';
    ['infoOpen', 'infoHigh', 'infoLow', 'infoClose', 'infoChg'].forEach(id => {
        document.getElementById(id).className = 'info-value';
    });
    document.getElementById('infoVol').className = 'info-value black-text';
    document.getElementById('infoDate').className = 'info-value black-text';
    document.getElementById('infoTurnover').className = 'info-value black-text';
    document.getElementById('infoAmplitude').className = 'info-value black-text';
    document.getElementById('infoPeTTM').className = 'info-value black-text';
    state.selectedItem = null;
}

export function updateTopPrice() {
    const el = document.getElementById('currentPrice');
    if (state.displayIndex < 0 || state.displayIndex >= state.fullDataCache.length) {
        el.textContent = '--';
        el.style.color = '#1e293b';
        return;
    }
    const item = state.fullDataCache[state.displayIndex];
    if (!item) {
        el.textContent = '--';
        el.style.color = '#1e293b';
        return;
    }
    let price;
    if (state.currentState === 'morning') {
        price = item.open;
    } else {
        price = item.close;
    }
    const isUp = price >= item.preclose;
    el.textContent = price.toFixed(2);
    el.style.color = isUp ? getCSSColor('--up') : getCSSColor('--down');
}

export function fillInfoBar(item, updateTop = true) {
    if (!item) { resetInfoBar(); return; }
    const isMorning = (state.currentState === 'morning' && state.displayIndex >= 0 && state.fullDataCache[state.displayIndex] &&
        state.fullDataCache[state.displayIndex].date === item.date);

    const pre = item.preclose;
    const open = item.open;
    const high = item.high;
    const low = item.low;
    const close = item.close;

    const getPriceCls = (val) => {
        if (val > pre) return 'red';
        if (val < pre) return 'green';
        return '';
    };

    let chgRate = ((close - pre) / pre) * 100;
    const chgText = chgRate >= 0 ? `+${chgRate.toFixed(2)}%` : `${chgRate.toFixed(2)}%`;
    const closeCls = getPriceCls(close);

    let peTTM = '--';
    if (state.fundamentalsCache.length > 0) {
        const currentDate = item.date;
        const valid = state.fundamentalsCache
            .filter(d => d.report_date <= currentDate)
            .sort((a, b) => a.report_date > b.report_date ? 1 : -1);

        const groups = new Map();
        for (const rec of valid) {
            const year = rec.report_date.substring(0, 4);
            if (!groups.has(year)) groups.set(year, []);
            groups.get(year).push(rec);
        }

        const quarterly = [];
        for (const [year, records] of groups) {
            records.sort((a, b) => a.report_date > b.report_date ? 1 : -1);
            let prevEps = 0;
            for (let i = 0; i < records.length; i++) {
                const eps = records[i].eps_diluted;
                if (eps === undefined || eps === null) continue;
                const single = eps - prevEps;
                quarterly.push(single);
                prevEps = eps;
            }
        }
        const recent4 = quarterly.slice(-4);
        if (recent4.length >= 4) {
            const epsSum = recent4.reduce((a, b) => a + b, 0);
            if (epsSum > 0) {
                const price = (state.currentState === 'morning' ? open : close);
                peTTM = (price / epsSum).toFixed(2);
            } else {
                peTTM = "亏损";
            }
        }
    }

    if (isMorning) {
        document.getElementById('infoOpen').textContent = open.toFixed(2);
        document.getElementById('infoOpen').className = `info-value ${getPriceCls(open)}`;
        document.getElementById('infoHigh').textContent = '--';
        document.getElementById('infoHigh').className = 'info-value';
        document.getElementById('infoLow').textContent = '--';
        document.getElementById('infoLow').className = 'info-value';
        document.getElementById('infoClose').textContent = '--';
        document.getElementById('infoClose').className = 'info-value';
        document.getElementById('infoVol').textContent = '--';
        document.getElementById('infoVol').className = 'info-value black-text';
        document.getElementById('infoChg').textContent = '--';
        document.getElementById('infoChg').className = 'info-value';
        document.getElementById('infoDate').textContent = item.date;
        document.getElementById('infoDate').className = 'info-value black-text';
        document.getElementById('infoTurnover').textContent = '--';
        document.getElementById('infoAmplitude').textContent = '--';
        document.getElementById('infoPeTTM').textContent = peTTM;
        document.getElementById('infoTurnover').className = 'info-value black-text';
        document.getElementById('infoAmplitude').className = 'info-value black-text';
        document.getElementById('infoPeTTM').className = 'info-value black-text';
        state.selectedItem = item;
        if (updateTop) updateTopPrice();
        return;
    }

    document.getElementById('infoOpen').textContent = open.toFixed(2);
    document.getElementById('infoOpen').className = `info-value ${getPriceCls(open)}`;
    document.getElementById('infoHigh').textContent = high.toFixed(2);
    document.getElementById('infoHigh').className = `info-value ${getPriceCls(high)}`;
    document.getElementById('infoLow').textContent = low.toFixed(2);
    document.getElementById('infoLow').className = `info-value ${getPriceCls(low)}`;
    document.getElementById('infoClose').textContent = close.toFixed(2);
    document.getElementById('infoClose').className = `info-value ${closeCls}`;
    document.getElementById('infoVol').textContent = formatVol(item.volume);
    document.getElementById('infoVol').className = 'info-value black-text';
    document.getElementById('infoChg').textContent = chgText;
    document.getElementById('infoChg').className = `info-value ${closeCls}`;
    document.getElementById('infoDate').textContent = item.date;
    document.getElementById('infoDate').className = 'info-value black-text';

    let turnover = '--';
    if (item.volume > 0 && state.latestFloatShare > 0) {
        turnover = (item.volume / state.latestFloatShare * 100).toFixed(2) + '%';
    }
    let amplitude = '--';
    if (pre > 0) {
        amplitude = ((high - low) / pre * 100).toFixed(2) + '%';
    }

    document.getElementById('infoTurnover').textContent = turnover;
    document.getElementById('infoAmplitude').textContent = amplitude;
    document.getElementById('infoPeTTM').textContent = peTTM;
    document.getElementById('infoTurnover').className = 'info-value black-text';
    document.getElementById('infoAmplitude').className = 'info-value black-text';
    document.getElementById('infoPeTTM').className = 'info-value black-text';

    state.selectedItem = item;
    if (updateTop) updateTopPrice();
}

// ---------- 状态标签 ----------
export function updateDateLabel() {
    const el = document.getElementById('displayDateLabel');
    if (state.displayIndex >= 0 && state.displayIndex < state.fullDataCache.length) {
        const date = state.fullDataCache[state.displayIndex].date;
        el.textContent = date;
        if (date !== state.currentDate) {
            state.currentDate = date;
            state.todayBuyShares = 0;
        }
    } else {
        el.textContent = '--';
    }
}

export function updateUIState() {
    const stateLabel = document.getElementById('stateLabel');
    const morningBtn = document.getElementById('morningBtn');
    const afternoonBtn = document.getElementById('afternoonBtn');

    if (state.currentState === 'morning') {
        stateLabel.textContent = '🌅 早盘';
        stateLabel.style.background = '#fde68a';
        stateLabel.style.color = '#78350f';
    } else {
        stateLabel.textContent = '🌇 尾盘';
        stateLabel.style.background = '#bbf7d0';
        stateLabel.style.color = '#14532d';
    }

    const isLast = state.displayIndex >= state.fullDataCache.length - 1;
    if (state.currentState === 'morning') {
        morningBtn.disabled = true;
        morningBtn.classList.remove('active-morning');
    } else {
        morningBtn.disabled = isLast;
        morningBtn.classList.remove('active-morning');
        if (!isLast) morningBtn.classList.add('active-morning');
    }

    if (state.currentState === 'morning') {
        afternoonBtn.disabled = false;
        afternoonBtn.classList.add('active-afternoon');
    } else {
        afternoonBtn.disabled = isLast;
        afternoonBtn.classList.remove('active-afternoon');
        if (!isLast) afternoonBtn.classList.add('active-afternoon');
    }
}

export function updateRangeInfo() {
    const el = document.getElementById('rangeInfo');
    if (state.fullDataCache.length > 0) {
        const start = state.fullDataCache[0].date;
        const end = state.fullDataCache[state.fullDataCache.length - 1].date;
        el.textContent = `${start}  ~  ${end}`;
    } else {
        el.textContent = '--  ~  --';
    }
}

export function updateStatus(text, type) {
    const el = document.getElementById('statusBadge');
    el.textContent = text;
    el.className = 'status' + (type ? ' ' + type : '');
}

export function updatePortfolioUI() {
    let currentPrice = 0;
    if (state.displayIndex >= 0 && state.displayIndex < state.fullDataCache.length) {
        const item = state.fullDataCache[state.displayIndex];
        if (state.currentState === 'morning') currentPrice = item.open;
        else currentPrice = item.close;
    }
    const marketValue = state.shares * currentPrice;
    const totalAsset = state.cash + marketValue;
    const posRatio = totalAsset > 0 ? (marketValue / totalAsset * 100) : 0;

    document.getElementById('totalAsset').textContent = totalAsset.toFixed(2);
    document.getElementById('totalMarketValue').textContent = marketValue.toFixed(2);
    document.getElementById('availableCash').textContent = state.cash.toFixed(2);
    document.getElementById('positionRatio').textContent = posRatio.toFixed(2) + '%';

    const tbody = document.getElementById('holdingsBody');
    if (state.shares === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">暂无持仓</td></tr>';
    } else {
        const code = document.getElementById('displayCode').textContent;
        const totalProfit = marketValue - state.totalInvest;
        const profitRate = state.totalInvest !== 0 ? (totalProfit / state.totalInvest * 100) : 0;
        const preClose = state.fullDataCache[state.displayIndex]?.preclose || currentPrice;
        // 当日盈亏：早盘显示 "--"，尾盘正常计算
        let dayProfit = '--';
        let dayCls = '';
        if (state.currentState === 'afternoon') {
            dayProfit = totalAsset - state.yesterdayTotalAsset;
            dayCls = dayProfit >= 0 ? 'red' : 'green';
        }
        const available = Math.max(0, state.shares - state.todayBuyShares);

        const profitCls = totalProfit >= 0 ? 'red' : 'green';
        const rateCls = profitRate >= 0 ? 'red' : 'green';

        tbody.innerHTML = `
            <tr>
                <td>${code}</td>
                <td class="${profitCls}">${totalProfit.toFixed(2)}</td>
                <td class="${rateCls}">${profitRate.toFixed(2)}%</td>
                <td>${state.cost.toFixed(2)}</td>
                <td class="${dayCls}">${dayProfit === '--' ? dayProfit : dayProfit.toFixed(2)}</td>
                <td>${state.shares} / ${available}</td>
            </tr>
        `;
    }

    // 更新交易面板的当前价格显示
    const tradePriceEl = document.getElementById('tradeCurrentPrice');
    if (tradePriceEl) {
        let price = 0;
        if (state.displayIndex >= 0 && state.displayIndex < state.fullDataCache.length) {
            const item = state.fullDataCache[state.displayIndex];
            price = state.currentState === 'morning' ? item.open : item.close;
        }
        tradePriceEl.textContent = price ? price.toFixed(2) : '--';
    }

    // 更新交易面板的输入框提示（当可用资金或可卖股数变化时，重置快速仓位）
    // 但这里不自动重置，由用户点击按钮触发。
}

// ---------- 基本面弹窗 ----------
let fundamentalPanel = null;

export function showFundamentals() {
    const code = document.getElementById('displayCode').textContent;
    if (!code || code === 'sh.600036' || state.displayIndex < 0 || !state.fullDataCache[state.displayIndex]) {
        alert('请先加载数据并定位到某一天');
        return;
    }
    const currentDate = state.fullDataCache[state.displayIndex].date;
    if (state.fundamentalsCache.length === 0) {
        alert('无基本面数据');
        return;
    }
    const sorted = state.fundamentalsCache.slice().sort((a, b) => {
        if (a.report_date > b.report_date) return -1;
        if (a.report_date < b.report_date) return 1;
        return 0;
    });
    let record = null;
    for (let d of sorted) {
        if (d.report_date <= currentDate) {
            record = d;
            break;
        }
    }
    if (!record) {
        alert(`未找到 ${code} 在 ${currentDate} 之前的基本面数据`);
        return;
    }
    const fields = [
        ['eps_diluted', '摊薄每股收益(元)'],
        ['eps_weighted', '加权每股收益(元)'],
        ['eps_adjusted', '调整后每股收益(元)'],
        ['eps_deduct_nonrecurring', '扣非每股收益(元)'],
        ['bps_before_adjust', '调整前每股净资产(元)'],
        ['bps_after_adjust', '调整后每股净资产(元)'],
        ['operating_cf_per_share', '每股经营性现金流(元)'],
        ['capital_reserve_per_share', '每股资本公积金(元)'],
        ['retained_earnings_per_share', '每股未分配利润(元)'],
        ['total_assets', '总资产(元)'],
        ['total_assets_growth', '总资产增长率(%)'],
        ['net_assets_growth', '净资产增长率(%)'],
        ['net_profit_deduct_nonrecurring', '扣非净利润(元)'],
        ['operating_profit', '主营业务利润(元)'],
        ['non_operating_ratio', '非主营比重(%)'],
        ['net_profit_growth', '净利润增长率(%)'],
        ['debt_to_assets_ratio', '资产负债率(%)'],
        ['equity_ratio', '股东权益比率(%)'],
        ['operating_cf_to_net_profit_ratio', '经营净现/净利润(%)'],
        ['operating_cf_to_liabilities_ratio', '经营净现/负债(%)'],
        ['total_share', '总股本(股)'],
        ['float_share', 'A股流通股本(股)'],
    ];
    let html = `<div style="padding:8px 12px;">`;
    html += `<div style="margin-bottom:8px;font-size:14px;color:#64748b;">报告日期：${record.report_date}</div>`;
    html += `<table>`;
    fields.forEach(([key, label]) => {
        let val = record[key];
        if (val === undefined || val === null) val = '--';
        else if (typeof val === 'number') {
            if (Math.abs(val) >= 1e8) val = (val / 1e8).toFixed(2) + '亿';
            else if (Math.abs(val) >= 1e4) val = (val / 1e4).toFixed(2) + '万';
            else val = val.toFixed(4);
        }
        html += `<tr><td>${label}</td><td>${val}</td></tr>`;
    });
    html += `</table></div>`;
    openFundamentalPanel(html);
}

export function openFundamentalPanel(contentHtml) {
    if (fundamentalPanel) {
        fundamentalPanel.remove();
        fundamentalPanel = null;
    }
    const panel = document.createElement('div');
    panel.id = 'fundamentalPanel';
    panel.innerHTML = `
        <div class="panel-title">
            <span>📊 基本面</span>
            <button class="close-btn" id="fundamentalCloseBtn">&times;</button>
        </div>
        <div class="panel-body">${contentHtml}</div>
    `;
    document.body.appendChild(panel);
    fundamentalPanel = panel;

    document.getElementById('fundamentalCloseBtn').addEventListener('click', () => {
        panel.remove();
        fundamentalPanel = null;
    });

    makeDraggableElement(panel, panel.querySelector('.panel-title'));
}

export function makeDraggableElement(container, handle) {
    let offsetX = 0, offsetY = 0, isDragging = false;
    handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.close-btn')) return;
        isDragging = true;
        const rect = container.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        container.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        let left = e.clientX - offsetX;
        let top = e.clientY - offsetY;
        left = Math.max(0, Math.min(window.innerWidth - container.offsetWidth, left));
        top = Math.max(0, Math.min(window.innerHeight - container.offsetHeight, top));
        container.style.left = left + 'px';
        container.style.top = top + 'px';
        container.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            container.style.cursor = 'default';
            document.body.style.userSelect = '';
        }
    });
}

// ---------- 事件弹窗（使用 CSS 类，颜色由主题控制） ----------
let eventPanel = null;

export function showEventPanel(eventData) {
    if (eventPanel) {
        eventPanel.remove();
        eventPanel = null;
    }
    const panel = document.createElement('div');
    panel.id = 'eventPanel';
    // 只保留定位和布局，颜色由 CSS 控制
    panel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 500px;
        max-height: 80vh;
        z-index: 2000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 24px 28px 20px;
        font-family: 'Georgia', serif;
    `;

    // 标题
    const titleDiv = document.createElement('div');
    titleDiv.className = 'event-title';
    titleDiv.textContent = (eventData.image || '📌') + ' ' + eventData.title;
    panel.appendChild(titleDiv);

    // 图片
    if (eventData.image) {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'event-image';
        imgDiv.textContent = eventData.image;
        panel.appendChild(imgDiv);
    }

    // 详情
    const descDiv = document.createElement('div');
    descDiv.className = 'event-desc';
    descDiv.innerHTML = eventData.description;
    panel.appendChild(descDiv);

    // 选项
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'event-options';
    const opts = eventData.options || [{text: '知道了', action: 'ignore'}];
    opts.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'event-btn';
        btn.textContent = opt.text;
        btn.addEventListener('click', () => {
            panel.remove();
            eventPanel = null;
        });
        optionsDiv.appendChild(btn);
    });
    panel.appendChild(optionsDiv);

    // 关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.className = 'event-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => {
        panel.remove();
        eventPanel = null;
    });
    panel.appendChild(closeBtn);

    makeDraggableElement(panel, panel, '.event-btn, .event-close, .close-btn');

    document.body.appendChild(panel);
    eventPanel = panel;
}
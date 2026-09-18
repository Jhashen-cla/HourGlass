// ============================================================
//  筹码峰（Chip Distribution）
//  同花顺式衰减模型：每天先按换手率衰减存量筹码，再把当日成交量
//  按三角分布投放到当日 [low, high] 区间，峰值落在当日成交均价上。
//
//  说明：筹码峰只依赖“选中日之前”的历史，与当前可见范围无关。
//  因此平移/缩放时只需按新的价格轴重绘，图像形状不变。
// ============================================================
import { state } from './state.js';
import { getCSSColor } from './utils.js';

// ---------- 可调参数 ----------
export const DECAY_K = 1.0;              // 基础衰减系数：α = 换手率 × K
export const DECAY_TRAPPED_R = 0.6;      // 套牢盘衰减折减（越小衰减越慢）
export const DECAY_CAP = 0.5;            // 单日衰减上限
export const TARGET_BINS = 1200;         // 目标档位数（越大越细，实际步长按整洁数取整）
export const MAX_BINS = 3000;            // 档位上上限，防止极宽价格区间拖慢计算
export const MIN_STEP = 0.01;            // 最小档位步长（元，即A股最小价位变动）
export const FALLBACK_TURNOVER_PCT = 1.0; // 换手率缺失时的兜底值（%）

// 与 chartCore.initChart 里 candleSeries 的 scaleMargins 保持一致
const PRICE_AREA_TOP = 0.01;
const PRICE_AREA_BOTTOM_MARGIN = 0.382;

const DEFAULT_SPLIT_RATIO = 0.62;   // K线占左侧默认比例
const MIN_SPLIT_RATIO = 0.30;       // 拖动下限（K线最窄 30%）
const MAX_SPLIT_RATIO = 0.80;       // 拖动上限（筹码峰最窄 20%）
const SPLITTER_W = 10;              // 分隔条宽度（与 CSS 保持一致）
const BAR_LEFT_PAD = 6;             // 筹码条距面板左边缘的留白
const RATIO_STORAGE_KEY = 'chipSplitRatio';
const BIND_MODE_KEY = 'chipBindMode';

// 筹码峰基准的两种模式（设置面板可选）
export const BIND_INFO_BAR = 'infobar';    // 绑定信息栏：点K线 / 早尾盘推进时跟随
export const BIND_RIGHTMOST = 'rightmost'; // 绑定最右侧K线：始终按当前视图最右那根，拖动时间轴也更新

// ============================================================
//  纯计算部分（不接触 DOM，可在 Node 里直接单测）
// ============================================================

/** 取“整洁”的档位步长：1/2/5 × 10^n */
export function niceStep(raw) {
    if (!(raw > 0)) return MIN_STEP;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / pow;
    let m = 10;
    if (norm <= 1) m = 1;
    else if (norm <= 2) m = 2;
    else if (norm <= 5) m = 5;
    return Math.max(m * pow, MIN_STEP);
}

/** 按给定K线序列的价格范围构建档位网格（一次算定，整个会话稳定） */
export function buildGrid(bars) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of bars || []) {
        if (!b) continue;
        if (b.low > 0 && b.low < lo) lo = b.low;
        if (b.high > hi) hi = b.high;
    }
    if (!isFinite(lo) || !isFinite(hi) || hi <= 0) return null;
    if (hi <= lo) hi = lo + MIN_STEP;
    let step = niceStep((hi - lo) / TARGET_BINS);
    if (step < MIN_STEP) step = MIN_STEP;
    // 极宽价格区间时放宽步长，保证档位数不失控
    if ((hi - lo) / step + 1 > MAX_BINS) step = niceStep((hi - lo) / MAX_BINS);
    const start = Math.floor(lo / step) * step;
    const bins = Math.max(1, Math.ceil((hi - start) / step) + 1);
    return { start, step, bins, low: lo, high: hi };
}

/** 当日成交均价：优先 amount/volume，缺失或单位异常时退化为 (H+L+C)/3 */
export function dayAvgPrice(bar) {
    const vol = Number(bar.volume) || 0;
    const amt = Number(bar.amount) || 0;
    if (vol > 0 && amt > 0) {
        const vwap = amt / vol;
        // 成交均价必然落在当日区间内，超出说明单位不一致，退回近似
        if (vwap >= bar.low * 0.98 && vwap <= bar.high * 1.02) return vwap;
    }
    return (bar.high + bar.low + bar.close) / 3;
}

/** 当日换手率（小数）：优先 turn 列，其次 volume/float_share，最后兜底 */
export function dayTurnover(bar, floatShare) {
    const t = Number(bar.turn) || 0;
    if (t > 0) return Math.min(t / 100, 0.9);
    const fs = Number(floatShare) || 0;
    const vol = Number(bar.volume) || 0;
    if (fs > 0 && vol > 0) return Math.min(vol / fs, 0.9);
    return FALLBACK_TURNOVER_PCT / 100;
}

export function binIndexOf(grid, price) {
    return Math.floor((price - grid.start) / grid.step);
}

/** 把当日成交量按三角分布投放到 [low, high] */
export function injectVolume(chips, grid, bar) {
    const vol = Number(bar.volume) || 0;
    if (vol <= 0) return;
    const lo = Math.max(bar.low, grid.start);
    const hi = Math.min(bar.high, grid.start + (grid.bins - 1) * grid.step);
    let i0 = binIndexOf(grid, lo);
    let i1 = binIndexOf(grid, hi);
    if (i1 < 0 || i0 > grid.bins - 1) return;
    i0 = Math.max(i0, 0);
    i1 = Math.min(i1, grid.bins - 1);
    if (i1 < i0) i1 = i0;

    const avg = dayAvgPrice(bar);
    const half = Math.max(avg - bar.low, bar.high - avg, 1e-9);
    const n = i1 - i0 + 1;
    const w = new Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const price = grid.start + (i0 + i) * grid.step;
        let x = 1 - Math.abs(price - avg) / half;
        if (x < 0) x = 0;
        w[i] = x;
        sum += x;
    }
    if (sum <= 0) {
        // 退化：全部落在最接近均价的档位
        const k = Math.min(Math.max(binIndexOf(grid, avg) - i0, 0), n - 1);
        w.fill(0);
        w[k] = 1;
        sum = 1;
    }
    for (let i = 0; i < n; i++) chips[i0 + i] += vol * w[i] / sum;
}

/** 单日：先衰减存量，再投放当日成交量（就地修改 chips） */
export function applyBar(chips, grid, bar, floatShareAt) {
    if (!bar || !(bar.close > 0)) return chips;
    const close = bar.close;
    const floatShare = typeof floatShareAt === 'function' ? floatShareAt(bar.date) : 0;
    const alpha = Math.min(dayTurnover(bar, floatShare) * DECAY_K, DECAY_CAP);
    if (alpha > 0) {
        const keepProfit = 1 - alpha;                   // 获利盘（价格低于收盘）
        const keepTrapped = 1 - alpha * DECAY_TRAPPED_R; // 套牢盘衰减更慢
        for (let b = 0; b < chips.length; b++) {
            if (chips[b] === 0) continue;
            const price = grid.start + b * grid.step;
            chips[b] *= (price > close ? keepTrapped : keepProfit);
        }
    }
    injectVolume(chips, grid, bar);
    return chips;
}

/** 从第 0 根累计到 endIdx（含），返回筹码数组 */
export function computeChips(bars, endIdx, grid, floatShareAt) {
    const chips = new Float64Array(grid.bins);
    const last = Math.min(endIdx, (bars || []).length - 1);
    for (let i = 0; i <= last; i++) {
        applyBar(chips, grid, bars[i], floatShareAt);
    }
    return chips;
}

/** 统计：获利比例、平均成本 */
export function chipStats(chips, grid, markPrice) {
    let total = 0;
    let profit = 0;
    let costSum = 0;
    for (let b = 0; b < chips.length; b++) {
        const v = chips[b];
        if (v <= 0) continue;
        const price = grid.start + b * grid.step;
        total += v;
        costSum += v * price;
        if (price < markPrice) profit += v;
    }
    return {
        total,
        profitRatio: total > 0 ? profit / total : 0,
        avgCost: total > 0 ? costSum / total : 0,
    };
}

// ============================================================
//  状态与增量计算
// ============================================================

function floatShareAt(dateStr) {
    const table = state.chipFloatTable || [];
    let v = 0;
    for (const r of table) {
        if (r.report_date <= dateStr) v = r.share;
        else break;
    }
    return v;
}

function buildFloatTable() {
    const table = (state.fundamentalsCache || [])
        .filter(r => r && r.report_date && Number(r.float_share) > 0)
        .map(r => ({ report_date: r.report_date, share: Number(r.float_share) }))
        .sort((a, b) => (a.report_date < b.report_date ? -1 : 1));
    state.chipFloatTable = table;
}

/** 面板打开状态下，当前选中K线的分界价（早盘用开盘价，避免泄露当日数据） */
export function selectedMarkPrice() {
    const item = (state.fullDataCache || [])[state.chipIndex];
    if (!item) return 0;
    if (state.currentState === 'morning' && state.chipIndex === state.displayIndex) {
        return item.open;
    }
    return item.close;
}

/** 早盘时选中的是“正在进行的那根K线”，则筹码只算到上一交易日 */
function effectiveEndDisplayIndex() {
    if (state.chipIndex < 0) return -1;
    if (state.currentState === 'morning' && state.chipIndex === state.displayIndex) {
        return state.chipIndex - 1;
    }
    return state.chipIndex;
}

export function resetChipModel() {
    state.chipVisible = false;
    state.chipIndex = -1;
    state.chipHistory = [];
    state.chipBars = null;
    state.chipOffset = 0;
    state.chipGrid = null;
    state.chipValues = null;
    state.chipComputedTo = -1;
    state.chipFloatTable = [];
    buildFloatTable();
    applyChipLayout();
}

/** 用 chipHistory + fullDataCache 重建模型序列与网格 */
export function rebuildChipBars() {
    const hist = state.chipHistory || [];
    const view = state.fullDataCache || [];
    state.chipBars = hist.concat(view);
    state.chipOffset = hist.length;
    state.chipGrid = buildGrid(state.chipBars);
    state.chipValues = null;
    state.chipComputedTo = -1;
}

/** 拉取登录起始日之前的历史（只喂筹码模型，不参与显示与交易） */
export async function prepareChipHistory(code, start) {
    rebuildChipBars();   // 先用当前可见窗口兜底，保证立刻可用
    try {
        const from = '2020-01-01';
        const to = start || '';
        const url = `http://127.0.0.1:8000/api/get_kline?code=${encodeURIComponent(code)}`
            + `&start=${from}&end=${to}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const list = json.kline_data || [];
        // 起始日当天的数据留给显示窗口，这里只保留之前的
        state.chipHistory = list.filter(d => d.date < to);
        rebuildChipBars();
        if (state.chipVisible) {
            refreshChips();
        }
    } catch (e) {
        console.warn('筹码峰历史拉取失败，改用可见窗口计算', e);
    }
}

function recomputeChips() {
    const grid = state.chipGrid;
    const bars = state.chipBars;
    if (!grid || !bars) {
        state.chipValues = null;
        return;
    }
    const endModel = state.chipOffset + effectiveEndDisplayIndex();
    if (endModel < 0) {
        state.chipValues = new Float64Array(grid.bins);
        state.chipComputedTo = -1;
        return;
    }
    if (!state.chipValues || endModel < state.chipComputedTo) {
        state.chipValues = new Float64Array(grid.bins);
        state.chipComputedTo = -1;
    }
    for (let i = state.chipComputedTo + 1; i <= endModel; i++) {
        applyBar(state.chipValues, grid, bars[i], floatShareAt);
    }
    state.chipComputedTo = endModel;
}

/** 重算（增量）+ 重绘，用于早盘/尾盘切换等会影响计算边界的场景 */
export function refreshChips() {
    if (!state.chipVisible) return;
    if (!state.chipValues || !state.chipGrid) rebuildChipBars();
    recomputeChips();
    drawChips();
}

function clampRatio(r) {
    const v = Number(r);
    if (!isFinite(v)) return DEFAULT_SPLIT_RATIO;   // 只有无效值才回默认
    return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, v));
}

/** 分屏布局：按当前比例设定左右宽度、同步K线图表尺寸并重绘筹码峰 */
export function applyChipLayout() {
    const split = document.getElementById('chartSplit');
    const chartPane = document.getElementById('chartPane');
    const chipPane = document.getElementById('chipPane');
    const splitter = document.getElementById('chipSplitter');
    if (!split || !chartPane || !chipPane || !splitter) return;

    const total = split.clientWidth || 0;
    const height = split.clientHeight || 0;
    const ratio = clampRatio(state.chipRatio);
    const avail = Math.max(0, total - (state.chipVisible ? SPLITTER_W : 0));
    const chartW = state.chipVisible ? Math.round(avail * ratio) : total;
    const chipW = state.chipVisible ? Math.max(0, avail - chartW) : 0;

    splitter.style.display = state.chipVisible ? 'block' : 'none';
    chipPane.style.display = state.chipVisible ? 'block' : 'none';
    chartPane.style.width = chartW + 'px';
    chipPane.style.width = chipW + 'px';

    if (state.chart && chartW > 0 && height > 0) {
        state.chart.resize(chartW, height);   // K线缩到左边
    }
    drawChips();
}

/** 点击K线：只记录选中项；面板已打开时同步刷新（不再自动弹出面板） */
export function selectChipBar(displayIdx) {
    state.chipIndex = displayIdx;
    if (!state.chipVisible) return;
    state.chipComputedTo = -1;
    state.chipValues = null;
    recomputeChips();
    drawChips();
}

/**
 * 与信息栏绑定：信息栏显示哪一天，筹码峰的选中项就跟到哪一天。
 * 面板未打开时只记录选中项，不做计算与重绘。
 */
export function syncChipToItem(item) {
    if (state.chipBindMode === BIND_RIGHTMOST) return;   // 该模式下基准日由视图右边缘决定
    if (!item || !item.date) return;
    const list = state.fullDataCache || [];
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i].date === item.date) { idx = i; break; }
    }
    if (idx < 0) return;
    selectChipBar(idx);
}

function normalizeBindMode(mode) {
    return mode === BIND_RIGHTMOST ? BIND_RIGHTMOST : BIND_INFO_BAR;
}

/** 把 lightweight-charts 的 Time 值转成 'YYYY-MM-DD' */
function timeToDateStr(t) {
    if (t == null) return null;
    if (typeof t === 'string') return t;
    if (typeof t === 'number') return new Date(t * 1000).toISOString().slice(0, 10);
    if (typeof t === 'object' && t.year) {
        const p = (n) => String(n).padStart(2, '0');
        return `${t.year}-${p(t.month)}-${p(t.day)}`;
    }
    return null;
}

/** 当前视图里最右边那根K线的下标（右侧留白时取最后一根真实K线） */
export function rightmostVisibleIndex() {
    const list = state.fullDataCache || [];
    if (!list.length || !state.chart) return -1;
    let to = null;
    try {
        const lr = state.chart.timeScale().getVisibleLogicalRange();
        if (lr && isFinite(lr.to)) to = lr.to;
    } catch (e) { /* 忽略 */ }
    if (to !== null) {
        return Math.max(0, Math.min(Math.floor(to), list.length - 1));
    }
    // 退化：用可见时间范围的右端
    try {
        const r = state.chart.timeScale().getVisibleRange();
        const toStr = timeToDateStr(r && r.to);
        if (toStr) {
            for (let i = list.length - 1; i >= 0; i--) {
                if (list[i].date <= toStr) return i;
            }
        }
    } catch (e) { /* 忽略 */ }
    return list.length - 1;
}

/** 视图变化（平移/缩放时间轴）：绑定最右侧K线时切换基准日，否则只按新价格轴重绘 */
export function onViewChanged() {
    if (state.chipVisible && state.chipBindMode === BIND_RIGHTMOST) {
        const idx = rightmostVisibleIndex();
        if (idx >= 0 && idx !== state.chipIndex) {
            selectChipBar(idx);   // 内部会重算 + 重绘
            return;
        }
    }
    drawChips();
}

/** 切换筹码峰基准（设置面板下拉） */
export function setChipBindMode(mode) {
    const next = normalizeBindMode(mode);
    state.chipBindMode = next;
    try { localStorage.setItem(BIND_MODE_KEY, next); } catch (e) { /* 忽略 */ }
    const sel = document.getElementById('chipBindMode');
    if (sel && sel.value !== next) sel.value = next;
    if (!state.chipVisible) return;
    if (next === BIND_RIGHTMOST) {
        const idx = rightmostVisibleIndex();
        if (idx >= 0) selectChipBar(idx);
    } else {
        // 切回信息栏模式：立刻对齐信息栏当前显示的日期
        const item = state.selectedItem;
        if (item && item.date) syncChipToItem(item);
        else selectChipBar(state.displayIndex >= 0 ? state.displayIndex : 0);
    }
}

/** 打开分屏面板（未选中过K线时默认看当前最后一根） */
export function openChipPanel() {
    if (state.chipBindMode === BIND_RIGHTMOST) {
        const idx = rightmostVisibleIndex();
        if (idx >= 0) state.chipIndex = idx;
    } else if (state.chipIndex < 0) {
        state.chipIndex = state.displayIndex >= 0 ? state.displayIndex : 0;
    }
    state.chipVisible = true;
    state.chipComputedTo = -1;
    state.chipValues = null;
    applyChipLayout();   // 先分屏，K线自动缩到左边
    recomputeChips();
    drawChips();
    updateToggleButton();
}

/** 收起分屏，K线恢复全宽 */
export function closeChipPanel() {
    state.chipVisible = false;
    applyChipLayout();
    updateToggleButton();
}

export function toggleChipPanel() {
    if (state.chipVisible) closeChipPanel();
    else openChipPanel();
}

function updateToggleButton() {
    const btn = document.getElementById('chipToggleBtn');
    if (btn) btn.classList.toggle('active', state.chipVisible);
}

// ============================================================
//  绘制
// ============================================================

function priceToY(price) {
    if (!state.candleSeries) return null;
    const y = state.candleSeries.priceToCoordinate(price);
    return (y === null || y === undefined || !isFinite(y)) ? null : y;
}

export function drawChips() {
    const pane = document.getElementById('chipPane');
    const canvas = document.getElementById('chipCanvas');
    const header = document.getElementById('chipHeader');
    if (!pane || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const panelW = pane.clientWidth || 0;
    const panelH = pane.clientHeight || 0;
    const ctx = canvas.getContext('2d');

    const ready = state.chipVisible && state.chipValues && state.chipGrid
        && state.chart && state.candleSeries && panelW > 0 && panelH > 0;
    if (!ready) {
        // 面板收起或数据未就绪：清空画布（面板显隐由 applyChipLayout 控制）
        canvas.width = Math.max(1, Math.round(panelW * dpr));
        canvas.height = Math.max(1, Math.round(panelH * dpr));
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (header) header.innerHTML = '';
        return;
    }

    canvas.style.width = panelW + 'px';
    canvas.style.height = panelH + 'px';
    canvas.width = Math.round(panelW * dpr);
    canvas.height = Math.round(panelH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, panelW, panelH);

    const grid = state.chipGrid;
    const chips = state.chipValues;
    // 价格区域按K线图表的高度换算，保证与价格轴严格对齐（两块面板等高）
    const chartEl = document.getElementById('main-chart');
    const chartH = (chartEl && chartEl.clientHeight) || panelH;
    const priceTop = chartH * PRICE_AREA_TOP;
    const priceBottom = chartH * (1 - PRICE_AREA_BOTTOM_MARGIN);
    const markPrice = selectedMarkPrice();

    let maxChip = 0;
    for (let b = 0; b < chips.length; b++) {
        if (chips[b] > maxChip) maxChip = chips[b];
    }
    if (maxChip <= 0) {
        ctx.clearRect(0, 0, panelW, panelH);
        if (header) header.innerHTML = '';
        return;
    }

    const colorProfit = getCSSColor('--up');    // 低于分界线 = 获利盘 = 红
    const colorLoss = getCSSColor('--down');    // 高于分界线 = 套牢盘 = 绿
    const barMaxW = panelW - BAR_LEFT_PAD * 2;

    for (let b = 0; b < chips.length; b++) {
        const v = chips[b];
        if (!(v > 0)) continue;
        const price = grid.start + b * grid.step;
        const yTop = priceToY(price + grid.step);
        const yBottom = priceToY(price);
        if (yTop === null || yBottom === null) continue;
        if (yBottom < priceTop || yTop > priceBottom) continue;
        const y0 = Math.max(yTop, priceTop);
        const y1 = Math.min(yBottom, priceBottom);
        const h = Math.max(1, y1 - y0);
        const w = Math.max(1, (v / maxChip) * barMaxW);
        ctx.fillStyle = price >= markPrice ? colorLoss : colorProfit;
        ctx.fillRect(BAR_LEFT_PAD, y0, w, h);   // 从左侧（紧邻价格轴）向右生长
    }

    // 分界线
    const ySplit = priceToY(markPrice);
    if (ySplit !== null && ySplit >= priceTop && ySplit <= priceBottom) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = getCSSColor('--text-muted');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(ySplit) + 0.5);
        ctx.lineTo(panelW, Math.round(ySplit) + 0.5);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = getCSSColor('--text-secondary');
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(markPrice.toFixed(2), 4, ySplit - 3);
    }

    // 顶部统计
    if (header) {
        const item = (state.fullDataCache || [])[state.chipIndex];
        const stats = chipStats(chips, grid, markPrice);
        const isMorning = state.currentState === 'morning' && state.chipIndex === state.displayIndex;
        header.innerHTML =
            `<div class="chip-title">筹码峰 · ${item ? item.date : '--'}` +
            `${isMorning ? '<span class="chip-note">（早盘未计入今日）</span>' : ''}</div>` +
            `<div class="chip-stats">获利 ${(stats.profitRatio * 100).toFixed(1)}%` +
            ` · 均价 ${stats.avgCost.toFixed(2)}</div>`;
    }
}

// 拖动分隔条时用 rAF 合并重排，避免每帧触发多次 resize
let dragRafPending = false;
function scheduleLayout() {
    const raf = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (fn) => fn();
    if (dragRafPending) return;
    dragRafPending = true;
    raf(() => {
        dragRafPending = false;
        applyChipLayout();
    });
}

function attachSplitterDrag(splitter) {
    const split = document.getElementById('chartSplit');
    let dragging = false;

    splitter.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        dragging = true;
        splitter.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging || !split) return;
        const rect = split.getBoundingClientRect();
        const avail = Math.max(1, rect.width - SPLITTER_W);
        state.chipRatio = clampRatio((e.clientX - rect.left) / avail);
        scheduleLayout();
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        splitter.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        try {
            localStorage.setItem(RATIO_STORAGE_KEY, String(state.chipRatio));
        } catch (e) { /* 隐私模式等无法写入时忽略 */ }
    });
}

/** 绑定下方按钮、关闭按钮与分隔条拖动（必须在 DOM 就绪后调用） */
export function initChipUI() {
    // 恢复上次调节的分屏比例
    try {
        const saved = parseFloat(localStorage.getItem(RATIO_STORAGE_KEY));
        if (isFinite(saved) && saved > 0) state.chipRatio = clampRatio(saved);
    } catch (e) { /* 忽略 */ }
    // 恢复上次选择的筹码峰基准
    try {
        const savedMode = localStorage.getItem(BIND_MODE_KEY);
        if (savedMode) state.chipBindMode = normalizeBindMode(savedMode);
    } catch (e) { /* 忽略 */ }

    const toggleBtn = document.getElementById('chipToggleBtn');
    const closeBtn = document.getElementById('chipCloseBtn');
    const splitter = document.getElementById('chipSplitter');
    const bindSel = document.getElementById('chipBindMode');

    if (toggleBtn) toggleBtn.addEventListener('click', toggleChipPanel);
    if (closeBtn) closeBtn.addEventListener('click', closeChipPanel);
    if (splitter) attachSplitterDrag(splitter);
    if (bindSel) {
        bindSel.value = state.chipBindMode;
        bindSel.addEventListener('change', () => setChipBindMode(bindSel.value));
    }
    updateToggleButton();
}

// ============================================================
//  图表核心功能（使用 state）
// ============================================================
import { state } from './state.js';
import { getCSSColor } from './utils.js';
import {
    updateDateLabel, updateUIState, updateTopPrice, updatePortfolioUI
} from './ui.js';
import { refreshChips, applyChipLayout, onViewChanged } from './chipDistribution.js';

// ---------- 辅助：获取交易标记 ----------
function getTradeMarkers() {
    const markers = [];
    for (const [date, flags] of Object.entries(state.transactions)) {
        const { buy, sell, active } = flags;
        let color, text, position;
        if (buy && sell) {
            color = '#ba9355cc';
            text = 'T';
            position = 'aboveBar';
        } else if (buy) {
            color = '#c87878';
            text = 'B';
            position = 'belowBar';
        } else if (sell) {
            color = '#73a89b';
            text = 'S';
            position = 'aboveBar';
        } else {
            continue;
        }
        // 如果该日期标记已结束（active === false），变为灰色
        if (!active) {
            color = '#b0b0b0';
        }
        markers.push({
            time: date,
            position: position,
            color: color,
            text: text,
            fontSize: 12,
            shape: 'circle',
            size: 2,
        });
    }
    return markers;
}

// ---------- 构造显示数据 ----------
function buildDisplayData() {
    if (state.fullDataCache.length === 0 || state.displayIndex < 0) return [];
    const data = [];
    for (let i = 0; i <= state.displayIndex; i++) {
        let item = state.fullDataCache[i];
        if (i === state.displayIndex && state.currentState === 'morning') {
            const open = item.open;
            data.push({
                time: item.date,
                open: open,
                high: open,
                low: open,
                close: open,
                volume: 0,
                preclose: item.preclose,
                _raw: item
            });
        } else {
            data.push({
                time: item.date,
                open: item.open,
                high: item.high,
                low: item.low,
                close: item.close,
                volume: item.volume,
                preclose: item.preclose,
                _raw: item
            });
        }
    }
    return data;
}

// ---------- 刷新高低点标注 ----------
export function refreshHighLowMarkers() {
    if (!state.chart || !state.candleSeries || state.fullDataCache.length === 0 || state.displayIndex < 0) {
        state.candleSeries && state.candleSeries.setMarkers([]);
        return;
    }
    const timeScale = state.chart.timeScale();
    const range = timeScale.getVisibleRange();
    if (!range) { state.candleSeries.setMarkers([]); return; }
    const { from, to } = range;
    const tFrom = new Date(from).getTime();
    const tTo = new Date(to).getTime();
    const displayData = buildDisplayData();
    const visible = displayData.filter(d => {
        const t = new Date(d.time).getTime();
        return t >= tFrom && t <= tTo;
    });
    let markers = [];
    const tradeMarkers = getTradeMarkers();
    markers = markers.concat(tradeMarkers);

    if (visible.length > 0) {
        let maxItem = visible[0], minItem = visible[0];
        visible.forEach(d => {
            if (d.high > maxItem.high) maxItem = d;
            if (d.low < minItem.low) minItem = d;
        });
        if (maxItem) markers.push({ time: maxItem.time, position: 'aboveBar', color: '#d32f2f',
            text: maxItem.high.toFixed(2), fontSize: 11, shape: 'text' });
        if (minItem) markers.push({ time: minItem.time, position: 'belowBar', color: '#00897b',
            text: minItem.low.toFixed(2), fontSize: 11, shape: 'text' });
    }
    state.candleSeries.setMarkers(markers);
}

// ---------- 清理副图 ----------
function clearSubSeries() {
    if (state.volSeries) { state.chart.removeSeries(state.volSeries); state.volSeries = null; }
    if (state.macdSeries) { state.chart.removeSeries(state.macdSeries); state.macdSeries = null; }
    if (state.macdLineSeries) {
        if (Array.isArray(state.macdLineSeries)) state.macdLineSeries.forEach(s => state.chart.removeSeries(s));
        state.macdLineSeries = null;
    }
    if (state.kdjSeries) {
        if (Array.isArray(state.kdjSeries)) state.kdjSeries.forEach(s => state.chart.removeSeries(s));
        state.kdjSeries = null;
    }
    if (state.costLineSeries) { state.chart.removeSeries(state.costLineSeries); state.costLineSeries = null; }
}

// ---------- 均线 ----------
function destroyAllMa() {
    if (state.ma5Line) { state.chart.removeSeries(state.ma5Line); state.ma5Line = null; }
    if (state.ma10Line) { state.chart.removeSeries(state.ma10Line); state.ma10Line = null; }
    if (state.ma20Line) { state.chart.removeSeries(state.ma20Line); state.ma20Line = null; }
    if (state.ma30Line) { state.chart.removeSeries(state.ma30Line); state.ma30Line = null; }
}

function drawMa(displayData) {
    destroyAllMa();
    if (!state.showMa || displayData.length === 0) return;
    const allData = state.fullDataCache.slice(0, state.displayIndex + 1);
    const ma5Data = allData.map(d => ({ time: d.date, value: d.ma5 || 0 }));
    const ma10Data = allData.map(d => ({ time: d.date, value: d.ma10 || 0 }));
    const ma20Data = allData.map(d => ({ time: d.date, value: d.ma20 || 0 }));
    const ma30Data = allData.map(d => ({ time: d.date, value: d.ma30 || 0 }));

    state.ma5Line = state.chart.addLineSeries({ 
        priceScaleId: 'price', 
        color: getCSSColor('--ma5'), 
        lineWidth: 1.5, 
        priceLineVisible: false 
    });
    state.ma5Line.setData(ma5Data);
    state.ma10Line = state.chart.addLineSeries({ 
        priceScaleId: 'price', 
        color: getCSSColor('--ma10'), 
        lineWidth: 1.5, 
        priceLineVisible: false 
    });
    state.ma10Line.setData(ma10Data);
    state.ma20Line = state.chart.addLineSeries({ 
        priceScaleId: 'price', 
        color: getCSSColor('--ma20'), 
        lineWidth: 1.5, 
        priceLineVisible: false 
    });
    state.ma20Line.setData(ma20Data);
    state.ma30Line = state.chart.addLineSeries({ 
        priceScaleId: 'price', 
        color: getCSSColor('--ma30'), 
        lineWidth: 1.5, 
        priceLineVisible: false 
    });
    state.ma30Line.setData(ma30Data);
}

// ---------- 成本线 ----------
function drawCostLine() {
    if (state.costLineSeries) {
        state.chart.removeSeries(state.costLineSeries);
        state.costLineSeries = null;
    }
    if (state.shares <= 0 || isNaN(state.cost) || !isFinite(state.cost)) return;

    const allData = state.fullDataCache.slice(0, state.displayIndex + 1);
    if (allData.length === 0) return;

    // 计算当前可见数据的价格范围
    let maxPrice = -Infinity;
    let minPrice = Infinity;
    for (const d of allData) {
        if (d.high > maxPrice) maxPrice = d.high;
        if (d.low < minPrice) minPrice = d.low;
    }
    if (!isFinite(maxPrice) || !isFinite(minPrice)) return;

    const range = maxPrice - minPrice;
    if (range < 1e-9) return; 
    const tolerance = range * 0.1;
    const lowerBound = minPrice - tolerance;
    const upperBound = maxPrice + tolerance;

    if (state.cost < lowerBound || state.cost > upperBound) {
        return;
    }

    const data = allData.map(d => ({ time: d.date, value: state.cost }));
    state.costLineSeries = state.chart.addLineSeries({
        priceScaleId: 'price',
        color: getCSSColor('--cost-line'),
        lineWidth: 1.5,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
    });
    state.costLineSeries.setData(data);
}

// ---------- 图表初始化 ----------
export function initChart() {
    const dom = document.getElementById('main-chart');
    if (state.chart) { state.chart.remove(); state.chart = null; }
    const bgColor = getCSSColor('--chart-bg');
    const textColor = getCSSColor('--chart-text');
    const gridColor = getCSSColor('--chart-grid');
    state.chart = LightweightCharts.createChart(dom, {
        layout: { background: { type: 'solid', color: bgColor }, textColor: textColor },
        timeScale: {
            timeVisible: true,
            barSpacing: 6,
            rightOffset: 2,
            fixLeftEdge: true,
            fixRightEdge: true,
            borderColor: gridColor,
        },
        rightPriceScale: { width: 50, borderVisible: true, borderColor: gridColor },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true },
    });

    const upColor = getCSSColor('--up');
    const downColor = getCSSColor('--down');
    state.candleSeries = state.chart.addCandlestickSeries({
        priceScaleId: 'price',
        upColor: upColor,
        downColor: downColor,
        wickUpColor: upColor,
        wickDownColor: downColor,
        borderVisible: false,
    });
    state.chart.priceScale('price').applyOptions({
        scaleMargins: { top: 0.01, bottom: 0.382 },
        borderColor: gridColor,
    });

    state.chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
        state.savedTimeRange = range;
        refreshHighLowMarkers();
        // 价格轴可能变化需重绘；绑定“最右侧K线”时这里还会切换筹码峰基准日
        onViewChanged();
    });

    state.chart.subscribeClick(param => {
        if (!param || !param.point) return;
        const timePoint = state.chart.timeScale().coordinateToTime(param.point.x);
        if (!timePoint) return;
        const target = state.fullDataCache.find(d => d.date === timePoint);
        if (target) {
            import('./ui.js').then(module => {
                module.fillInfoBar(target, false);   // 信息栏更新后会带动筹码峰（见 ui.js）
            });
        }
    });

    applyChipLayout();   // 新建图表后同步分屏尺寸（面板可能仍处于打开状态）
    return state.chart;
}

// ---------- 核心渲染 ----------
export function renderChart(displayIdx, options) {
    options = options || {};
    const { preserveView = false, fitContent = false } = options;

    if (!state.chart) initChart();
    const displayData = buildDisplayData();
    if (displayData.length === 0) return;

    clearSubSeries();
    destroyAllMa();

    const candleData = [];
    let prevColor = null;
    const upColor = getCSSColor('--up');
    const downColor = getCSSColor('--down');
    for (let i = 0; i < displayData.length; i++) {
        const d = displayData[i];
        const open = d.open;
        const close = d.close;
        const preclose = d.preclose;
        let color;

        if (open === close) {
            if (close > preclose) {
                color = upColor;
            } else if (close < preclose) {
                color = downColor;
            } else {
                color = prevColor || upColor;
            }
        } else {
            color = close > open ? upColor : downColor;
        }

        candleData.push({
            time: d.time,
            open: open,
            high: d.high,
            low: d.low,
            close: close,
            color: color,
            wickColor: color,
        });
        prevColor = color;
    }

    state.candleSeries.setData(candleData);

    drawMa(displayData);
    drawCostLine();

    const rawData = state.fullDataCache.slice(0, state.displayIndex + 1);
    if (state.currentIndicator === 'volume') {
        const volData = rawData.map((d, index) => {
            let value = d.volume;
            let color = d.close > d.preclose ? upColor : downColor;
            // 如果是早盘且是当天（最后一条），成交量设为 0
            if (state.currentState === 'morning' && index === rawData.length - 1) {
                value = 0;
                color = upColor;
            }
            return {
                time: d.date,
                value: value,
                color: color
            };
        });
        state.volSeries = state.chart.addHistogramSeries({
            priceScaleId: 'volume',
            priceFormat: { type: 'custom', formatter: (v) => {
                if (v == null || v === 0) return '0';
                if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
                if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
                return String(v);
            } },
        });
        state.volSeries.setData(volData);
        state.chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.618, bottom: 0.01 }, borderColor: getCSSColor('--chart-grid') });
    } else if (state.currentIndicator === 'macd') {
        const barData = rawData.map(d => ({
            time: d.date,
            value: d.macd_bar || 0,
            color: (d.macd_bar || 0) >= 0 ? getCSSColor('--macd-bar-up') : getCSSColor('--macd-bar-down')
        }));
        state.macdSeries = state.chart.addHistogramSeries({
            priceScaleId: 'macd',
            priceFormat: { type: 'custom', formatter: v => v.toFixed(3) }
        });
        state.macdSeries.setData(barData);
        const l1 = state.chart.addLineSeries({
            priceScaleId: 'macd',
            color: getCSSColor('--dif'),
            lineWidth: 1.5,
            priceFormat: { type: 'custom', formatter: v => v.toFixed(3) }
        });
        l1.setData(rawData.map(d => ({ time: d.date, value: d.macd_dif || 0 })));
        const l2 = state.chart.addLineSeries({
            priceScaleId: 'macd',
            color: getCSSColor('--dea'),
            lineWidth: 1.5,
            priceFormat: { type: 'custom', formatter: v => v.toFixed(3) }
        });
        l2.setData(rawData.map(d => ({ time: d.date, value: d.macd_dea || 0 })));
        state.macdLineSeries = [l1, l2];
        state.chart.priceScale('macd').applyOptions({ scaleMargins: { top: 0.618, bottom: 0.01 }, borderColor: getCSSColor('--chart-grid') });
    } else if (state.currentIndicator === 'kdj') {
        state.kdjSeries = [];
        const lk = state.chart.addLineSeries({
            priceScaleId: 'kdj',
            color: getCSSColor('--k'),
            lineWidth: 1.5,
            priceFormat: { type: 'custom', formatter: v => v.toFixed(1) }
        });
        lk.setData(rawData.map(d => ({ time: d.date, value: d.kdj_k || 50 })));
        state.kdjSeries.push(lk);
        const ld = state.chart.addLineSeries({
            priceScaleId: 'kdj',
            color: getCSSColor('--d'),
            lineWidth: 1.5,
            priceFormat: { type: 'custom', formatter: v => v.toFixed(1) }
        });
        ld.setData(rawData.map(d => ({ time: d.date, value: d.kdj_d || 50 })));
        state.kdjSeries.push(ld);
        const lj = state.chart.addLineSeries({
            priceScaleId: 'kdj',
            color: getCSSColor('--j'),
            lineWidth: 1.5,
            priceFormat: { type: 'custom', formatter: v => v.toFixed(1) }
        });
        lj.setData(rawData.map(d => ({ time: d.date, value: d.kdj_j || 50 })));
        state.kdjSeries.push(lj);
        state.chart.priceScale('kdj').applyOptions({ scaleMargins: { top: 0.618, bottom: 0.01 }, borderColor: getCSSColor('--chart-grid') });
    }

    if (fitContent || state.isFirstLoad) {
        state.chart.timeScale().fitContent();
        const total = displayData.length;
        const count = Math.min(64, total);
        const fromIdx = Math.max(0, total - count);
        const fromTime = displayData[fromIdx].time;
        const toTime = displayData[displayData.length - 1].time;
        state.chart.timeScale().setVisibleRange({ from: fromTime, to: toTime });
        state.savedTimeRange = state.chart.timeScale().getVisibleRange();
        state.isFirstLoad = false;
    } else if (preserveView && state.savedTimeRange) {
        state.chart.timeScale().setVisibleRange(state.savedTimeRange);
    }

    setTimeout(() => refreshHighLowMarkers(), 60);

    updateDateLabel();
    updateUIState();
    updateTopPrice();
    updatePortfolioUI();
    refreshChips();   // 早盘/尾盘、主题切换、缩放窗口后保持筹码峰与价格轴对齐
}

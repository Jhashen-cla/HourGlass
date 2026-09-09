// ============================================================
//  全局状态（统一使用 state 对象）
// ============================================================

export const state = {
    // 图表系列
    chart: null,
    candleSeries: null,
    volSeries: null,
    macdSeries: null,
    macdLineSeries: null,
    kdjSeries: null,
    ma5Line: null,
    ma10Line: null,
    ma20Line: null,
    ma30Line: null,
    costLineSeries: null,

    // 数据
    fullDataCache: [],
    displayIndex: -1,
    currentState: 'afternoon',
    currentIndicator: 'volume',
    showMa: false,
    savedTimeRange: null,
    isFirstLoad: true,
    selectedItem: null,

    // 交易
    initialCapital: 100000,
    yesterdayTotalAsset: 100000,  
    cash: 0,
    shares: 0,
    totalInvest: 0,
    cost: 0,
    transactions: {},
    todayBuyShares: 0,
    currentDate: '',

    // 基本面
    fundamentalsCache: [],
    epsList: [],
    latestFloatShare: 0,
};
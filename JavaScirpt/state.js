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

    // 筹码峰
    chipVisible: false,
    chipIndex: -1,        // 选中的K线在 fullDataCache 中的下标
    chipHistory: [],      // 登录起始日之前的K线（只喂筹码模型，不显示、不参与交易）
    chipBars: null,       // 筹码模型使用的完整序列 = chipHistory + fullDataCache
    chipOffset: 0,        // fullDataCache[0] 在 chipBars 中的位置
    chipGrid: null,       // 价格档位网格
    chipValues: null,     // 每个档位的筹码量
    chipComputedTo: -1,   // 已累计到的 chipBars 下标
    chipFloatTable: [],   // 按报告期排序的流通股本，用于估算换手率
    chipRatio: 0.62,      // 分屏比例：K线占左侧的比例（可拖动调节）
    chipBindMode: 'infobar',  // 筹码峰基准：'infobar' 绑定信息栏 / 'rightmost' 绑定最右侧K线
};

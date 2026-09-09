// ============================================================
//  主入口：初始化应用，绑定事件
// ============================================================
import { initChart } from './chartCore.js';
import { loadStockList, loadData } from './dataLoader.js';
import {
    onMorning, onAfternoon, switchIndicator, toggleMaShow,
    makeDraggable, initApp, handleSearchInput
} from './operationHandlers.js';
import { showFundamentals } from './ui.js';
import { executeTrade } from './trading.js';
import { loadEvents } from './events.js';
import { state } from './state.js';
import { renderChart } from './chartCore.js';

document.addEventListener('DOMContentLoaded', function() {
    // 加载股票列表
    loadStockList();
    loadEvents();

    // 搜索输入事件
    const searchInput = document.getElementById('loginCode');
    searchInput.addEventListener('input', handleSearchInput);

    // 点击外部关闭下拉
    document.addEventListener('click', function(e) {
        const wrapper = document.querySelector('.search-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            document.getElementById('searchDropdown').classList.remove('active');
        }
    });

    // 登录确认按钮
    document.getElementById('loginConfirm').addEventListener('click', initApp);
    document.querySelectorAll('#loginOverlay input').forEach(inp => {
        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') initApp();
        });
    });

    // 主界面按钮绑定
    const morningBtn = document.getElementById('morningBtn');
    const afternoonBtn = document.getElementById('afternoonBtn');
    if (morningBtn) {
        morningBtn.addEventListener('click', onMorning);
        afternoonBtn.addEventListener('click', onAfternoon);
    }

    const indicatorSelect = document.getElementById('indicatorSelect');
    if (indicatorSelect) {
        indicatorSelect.addEventListener('change', function() {
            switchIndicator(this.value);
        });
    }

    const maCheck = document.getElementById('showMaCheck');
    if (maCheck) {
        maCheck.addEventListener('change', toggleMaShow);
    }

    // 交易面板
    const tradeToggle = document.getElementById('tradeToggleBtn');
    const tradePanel = document.getElementById('tradePanel');
    const closePanel = document.getElementById('tradePanelClose');
    if (tradeToggle) {
        tradeToggle.addEventListener('click', () => {
            tradePanel.classList.toggle('visible');
        });
        closePanel.addEventListener('click', () => {
            tradePanel.classList.remove('visible');
        });
    }

    makeDraggable();

    const btnBuy = document.getElementById('btnBuy');
    const btnSell = document.getElementById('btnSell');
    if (btnBuy) {
        btnBuy.addEventListener('click', function() {
            const sharesInput = parseInt(document.getElementById('tradeShares').value);
            executeTrade('buy', sharesInput);
        });
        btnSell.addEventListener('click', function() {
            const sharesInput = parseInt(document.getElementById('tradeShares').value);
            executeTrade('sell', sharesInput);
        });
    }

    // 基本面按钮
    const fundBtn = document.getElementById('fundamentalBtn');
    if (fundBtn) {
        fundBtn.addEventListener('click', showFundamentals);
    }

    // 窗口resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.chart) {
                const w = document.getElementById('main-chart').clientWidth;
                window.chart.resize(w, 620);
                // 保存可见范围由 state 管理，但在 resize 中我们保留原逻辑
            }
        }, 200);
    });

    // 点击图表外重置信息栏
    document.addEventListener('click', function(e) {
        const chartDom = document.getElementById('main-chart');
        if (chartDom && !chartDom.contains(e.target)) {
            const btnGroup = document.querySelector('.btn-group');
            if (btnGroup && btnGroup.contains(e.target)) return;
            const tradePanel = document.getElementById('tradePanel');
            if (tradePanel && tradePanel.contains(e.target)) return;
            import('./ui.js').then(module => module.resetInfoBar());
        }
    });

    // ---------- 设置面板 ----------
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsClose = document.getElementById('settingsClose');
    const themeOptions = document.querySelectorAll('.theme-option');

    function openSettings() {
        settingsPanel.style.display = 'block';
    }
    function closeSettings() {
        settingsPanel.style.display = 'none';
    }
    settingsBtn.addEventListener('click', openSettings);
    settingsClose.addEventListener('click', closeSettings);
    document.addEventListener('click', (e) => {
        if (settingsPanel.style.display === 'block' && !settingsPanel.contains(e.target) && e.target !== settingsBtn) {
            closeSettings();
        }
    });

    // 主题切换
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    themeOptions.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.theme === savedTheme);
        opt.addEventListener('click', () => {
            const theme = opt.dataset.theme;
            document.body.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            themeOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            closeSettings();
            // 重新渲染图表以应用新主题颜色
            if (state.fullDataCache.length > 0) {
                renderChart(state.displayIndex, { preserveView: true, fitContent: false });
            }
        });
    });

    // 标签切换（仅示例）
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const pageId = tab.dataset.tab;
            document.querySelectorAll('.settings-page').forEach(p => p.classList.remove('active'));
            document.getElementById(`page-${pageId}`).classList.add('active');
        });
    });

    // 暴露一些全局变量（兼容旧代码）
    window.loadData = loadData;
    window.onMorning = onMorning;
    window.onAfternoon = onAfternoon;
    window.switchIndicator = switchIndicator;
    window.toggleMaShow = toggleMaShow;
    window.initApp = initApp;
    window.state = state;
});
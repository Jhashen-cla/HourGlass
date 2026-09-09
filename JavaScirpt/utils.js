// ============================================================
//  工具函数
// ============================================================

export function formatVol(v) {
    if (v == null || v === 0) return '--';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return String(v);
}

export function formatNum(v) {
    return v != null ? Number(v).toFixed(2) : '--';
}

export function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

export function findIndexByDate(arr, dateStr) {
    for (let i = 0; i < arr.length; i++) {
        if (arr[i].date === dateStr) return i;
    }
    return -1;
}

export function calcCommission(amount) {
    let fee = amount * 0.0003; // COMMISSION_RATE
    return Math.max(fee, 5);   // MIN_COMMISSION
}

export function calcStamp(amount) {
    return amount * 0.0005;    // STAMP_RATE
}

// 获取 CSS 变量值（用于主题颜色）
export function getCSSColor(varName) {
    return getComputedStyle(document.body).getPropertyValue(varName).trim() || '#000';
}
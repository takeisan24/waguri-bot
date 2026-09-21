// ============================================================
// lib/bakery.js — Logic THUẦN cho Tiệm Bánh Gekka (dễ test, mirror RPC bakery_collect).
// Không đụng DB, không async. Xem docs/design-tiem-banh-gekka.md.
//
// MÔ HÌNH: stock = "kho doanh thu tiềm năng" (VNĐ) nạp từ nguyên liệu (giá × markup).
//   Tiệm nướng RATE VNĐ/phút, rút dần stock, dồn vào doanh thu — TRẦN = capacity/lần thu.
//   /thu: doanh thu -> ví. Hybrid: cứ CAKE_EVERY doanh thu -> tặng 1 bánh (item buff).
// ============================================================
const config = require('../config');

const B = config.BAKERY;

/** Thông số cấp (kẹp trong [1..số cấp]). */
function levelInfo(level) {
    const L = B.LEVELS;
    const i = Math.max(0, Math.min((level || 1) - 1, L.length - 1));
    return L[i];
}

/** Cấp tối đa hiện có. */
function maxLevel() { return B.LEVELS.length; }

/** Nạp nguyên liệu: giá item × số lượng × markup -> điểm stock cộng thêm. */
function fillingStockGain(itemPrice, qty) {
    return Math.floor(Number(itemPrice || 0) * Number(qty || 0) * B.BAKE_MARKUP);
}

/**
 * Tính mẻ nướng kể từ lastCollectMs. HÀM THUẦN (RPC bakery_collect làm y hệt, nguyên tử).
 * @returns {{revenue, bakedMin, newStock, capped, stockLimited}}
 *   revenue: doanh thu nướng được · newStock: kho còn lại · capped: đầy trần (mất thời gian dư)
 *   stockLimited: hết nguyên liệu trước khi hết thời gian (nhắc tiếp NL).
 */
function computeBake({ stock, level, lastCollectMs, customRate, customCap }, nowMs) {
    const base = levelInfo(level);
    const rate = customRate !== undefined ? customRate : base.rate;
    const cap = customCap !== undefined ? customCap : base.cap;
    const s = Math.max(0, Number(stock || 0));
    const elapsedMin = Math.max(0, Math.floor((nowMs - lastCollectMs) / 60000));
    const capMin = Math.floor(cap / rate);          // số phút để đầy trần
    const stockMin = Math.floor(s / rate);          // số phút kho đủ nướng
    const bakedMin = Math.min(elapsedMin, stockMin, capMin);
    const revenue = bakedMin * rate;
    return {
        revenue,
        bakedMin,
        newStock: s - revenue,
        capped: elapsedMin > capMin && capMin <= stockMin,       // hết trần mà còn thời gian & còn NL
        stockLimited: stockMin < elapsedMin && stockMin < capMin, // hết NL trước
    };
}

/** Hybrid bánh: cộng doanh thu vào tiến trình, trả số bánh nguyên + tiến trình dư. */
function cakesFromRevenue(prevProgress, revenue) {
    const total = Math.max(0, Number(prevProgress || 0)) + Math.max(0, Number(revenue || 0));
    const cakes = Math.floor(total / B.CAKE_EVERY);
    return { cakes, newProgress: total - cakes * B.CAKE_EVERY };
}

/** Tính toán tổng số lượng bonus từ staff và decor */
function computeBonuses(staffList = [], decorList = []) {
    let rateMult = 1.0;
    let capMult = 1.0;
    let wagePct = 0.0;
    let cakeDiscount = 0.0;

    (staffList || []).forEach(sid => {
        const sc = B.STAFF[sid];
        if (sc) {
            rateMult += (sc.rate || 0) + (sc.rev || 0);
            capMult += (sc.cap || 0);
            wagePct += (sc.wage || 0);
            if (sc.cake_discount) {
                cakeDiscount += sc.cake_discount;
            }
        }
    });

    (decorList || []).forEach(iid => {
        const dc = B.DECOR[iid];
        if (dc) {
            rateMult += (dc.rate || 0);
        }
    });

    return { rateMult, capMult, wagePct, cakeDiscount };
}

/**
 * Kiểm tra xem hiện tại có đang trong Giờ Cao Điểm (Rush Hour) của tiệm bánh hay không.
 * Múi giờ Việt Nam = UTC + 7.
 */
function isRushHour(nowMs = Date.now()) {
    const d = new Date(nowMs);
    const vnHour = (d.getUTCHours() + 7) % 24;
    const windows = B.RUSH_HOUR?.WINDOWS || [];
    return windows.some(w => vnHour >= w.startHourVN && vnHour < w.endHourVN);
}

/**
 * Lấy danh sách 3 đơn hàng VIP tất định trong ngày cho người chơi.
 * 0 DB query, tất định theo (userId, dateStr).
 */
function getDailyBakeryOrders(userId, dateStr) {
    if (!dateStr) {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
    }

    const pool = B.VIP_ORDERS_POOL || [];
    if (!pool.length) return [];

    const selected = [];
    const poolCopy = [...pool];

    for (let slot = 0; slot < 3 && poolCopy.length > 0; slot++) {
        let hash = 0;
        const str = `${userId}:${dateStr}:${slot}`;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        const idx = Math.abs(hash) % poolCopy.length;
        const chosen = poolCopy.splice(idx, 1)[0];
        selected.push({
            orderIndex: slot + 1,
            ...chosen,
            orderDate: dateStr,
        });
    }

    return selected;
}

/** Lấy thông số hiệu dụng đã áp dụng bonus */
function getEffectiveStats(level, staffList = [], decorList = [], bakeryEfficiencyLvl = 0, nowMs = Date.now()) {
    const base = levelInfo(level);
    const bonuses = computeBonuses(staffList, decorList);
    const petBuffMult = 1.0 + (bakeryEfficiencyLvl * 0.05); // +5% speed per level
    const standardRate = Math.round(base.rate * bonuses.rateMult * petBuffMult);
    const rush = isRushHour(nowMs);
    const rushRate = rush ? Math.round(standardRate * (1.0 + (B.RUSH_HOUR?.BONUS_RATE || 0.20))) : standardRate;

    return {
        rate: standardRate,
        rushRate,
        isRushHour: rush,
        baseRate: base.rate,
        cap: Math.round(base.cap * bonuses.capMult),
        wagePct: bonuses.wagePct,
        cakeEvery: Math.round(B.CAKE_EVERY * (1.0 - bonuses.cakeDiscount))
    };
}

module.exports = {
    levelInfo,
    maxLevel,
    fillingStockGain,
    computeBake,
    cakesFromRevenue,
    computeBonuses,
    getEffectiveStats,
    isRushHour,
    getDailyBakeryOrders,
};


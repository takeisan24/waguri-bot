const config = require('../config');

// Theo dõi số lần làm việc liên tiếp gần đây (RAM) để giảm thu nhập dần (chống cày máy).
const store = new Map(); // userId -> { count, ts }

/** Trả hệ số thu nhập (1.0 -> FLOOR) và tăng đếm. Nghỉ đủ lâu thì hồi về 1.0. */
function fatigueMultiplier(userId) {
    const now = Date.now();
    const r = store.get(userId) || { count: 0, ts: now };
    if (now - r.ts > config.FATIGUE.RESET_MS) r.count = 0; // nghỉ đủ lâu -> hồi sức
    const mult = Math.max(config.FATIGUE.FLOOR, 1 - r.count * config.FATIGUE.STEP);
    r.count++;
    r.ts = now;
    store.set(userId, r);
    return mult;
}

/** Giải trí/nghỉ ngơi -> giảm bớt độ mệt (giảm count). */
function restFatigue(userId, amount = 1) {
    const r = store.get(userId);
    if (r) { r.count = Math.max(0, r.count - amount); store.set(userId, r); }
}

/** Hồi sức hoàn toàn (vd khi /ngu). */
function resetFatigue(userId) {
    store.delete(userId);
}

module.exports = { fatigueMultiplier, restFatigue, resetFatigue };

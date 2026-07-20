const config = require('../config');

// Rate limit tổng theo cửa sổ cố định (RAM) — chống spam lệnh / quá tải DB.
const buckets = new Map(); // userId -> { start, count }

/** True nếu user vượt giới hạn (đồng thời ghi nhận lượt gọi này). */
function rateLimited(userId, max = config.RATE_LIMIT.MAX, windowMs = config.RATE_LIMIT.WINDOW_MS) {
    const now = Date.now();
    const b = buckets.get(userId);
    if (!b || now - b.start >= windowMs) {
        buckets.set(userId, { start: now, count: 1 });
        return false;
    }
    if (b.count >= max) return true;
    b.count++;
    return false;
}

// Dọn định kỳ các bucket đã hết cửa sổ — như chatCD/contexts/noitu, tránh Map phình vô hạn
// theo số user lifetime (mỗi user 1 entry nhỏ, nhưng bot chạy dài ngày thì vẫn nên gom rác).
const SWEEP_MS = 10 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    const windowMs = config.RATE_LIMIT.WINDOW_MS;
    for (const [userId, b] of buckets) {
        if (now - b.start >= windowMs) buckets.delete(userId);
    }
}, SWEEP_MS).unref();

module.exports = { rateLimited };

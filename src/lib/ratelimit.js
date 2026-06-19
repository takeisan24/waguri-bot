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

module.exports = { rateLimited };

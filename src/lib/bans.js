const db = require('../database.js');

// Tập user bị chặn, giữ trong RAM để check nhanh (không query DB mỗi lệnh).
const banned = new Set();

/** Nạp danh sách ban từ DB (gọi lúc khởi động). */
async function loadBans() {
    const ids = await db.getBannedIds();
    banned.clear();
    ids.forEach(id => banned.add(id));
    return banned.size;
}

const isBanned = id => banned.has(id);

/** Cập nhật cache + DB. */
async function setBan(userId, val) {
    const ok = await db.setBanned(userId, val);
    if (ok) { if (val) banned.add(userId); else banned.delete(userId); }
    return ok;
}

module.exports = { loadBans, isBanned, setBan };

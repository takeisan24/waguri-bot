const db = require('../database.js');
const config = require('../config');

// Theo dõi mức độ cờ bạc gần đây theo RAM (có decay theo thời gian).
const recent = new Map(); // userId -> { count, ts }

function bumpCount(userId) {
    const now = Date.now();
    const r = recent.get(userId) || { count: 0, ts: now };
    // "Nguội" dần nếu lâu không chơi
    if (now - r.ts > config.POLICE.DECAY_MS) {
        r.count = Math.max(0, r.count - Math.floor((now - r.ts) / config.POLICE.DECAY_MS));
    }
    r.count++;
    r.ts = now;
    recent.set(userId, r);
    return r.count;
}

/**
 * Gọi sau mỗi ván cờ bạc. Trả về số tiền bị phạt nếu bị "công an bắt", hoặc null.
 */
async function applyPolice(userId) {
    const count = bumpCount(userId);
    const chance = Math.min(config.POLICE.BASE_CHANCE + count * config.POLICE.STEP, config.POLICE.MAX_CHANCE);
    if (Math.random() >= chance) return null;

    const u = await db.getUser(userId);
    const fine = Math.floor(Number(u?.wallet || 0) * config.POLICE.FINE_PCT);
    recent.set(userId, { count: 0, ts: Date.now() }); // bị bắt rồi thì reset
    if (fine > 0) await db.addMoney(userId, -fine, 'wallet');
    return fine;
}

module.exports = { applyPolice };

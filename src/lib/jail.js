// lib/jail.js — Hệ "giam giữ" dùng chung.
// Khi phạm pháp thất bại (cướp /rob, trộm heo/cây) mà không đủ tiền nộp phạt,
// người chơi bị giam: tạm chặn các lệnh kiếm tiền / cờ bạc / đi trộm.
const db = require('../database.js');

// Tên lệnh (slash hoặc prefix) bị chặn khi đang bị giam.
const JAIL_BLOCKED = new Set([
    // kiếm tiền
    'work', 'fish', 'mine', 'chop', 'daily', 'quest',
    // cờ bạc / minigame ăn tiền
    'taixiu', 'baucua', 'blackjack', 'coinflip', 'crate',
    'bacay', 'loto', 'bingo', 'masoi', 'xocdia', 'duangua',
    // trộm cướp
    'rob',
    // (heo/cây sẽ thêm tên prefix khi triển khai: muaheo, tromheo, muagiong, trom, ...)
]);

const isBlocked = name => JAIL_BLOCKED.has(name);

/** Trả { until:number(ms), reason } nếu đang bị giam, ngược lại null. */
async function getJail(userId) {
    const row = await db.getJail(userId);
    if (!row || !row.jailed_until) return null;
    const until = new Date(row.jailed_until).getTime();
    if (!until || until <= Date.now()) return null;
    return { until, reason: row.jail_reason };
}

module.exports = { JAIL_BLOCKED, isBlocked, getJail };

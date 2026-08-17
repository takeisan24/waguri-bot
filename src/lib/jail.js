// lib/jail.js — Hệ "giam giữ" dùng chung.
// Khi phạm pháp thất bại (cướp /rob, trộm heo/cây) mà không đủ tiền nộp phạt,
// người chơi bị giam: tạm chặn các lệnh kiếm tiền / cờ bạc / đi trộm.
const db = require('../database.js');
const { withTimeout, ACK_LOOKUP_TIMEOUT } = require('./timeout');

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

/**
 * Bản dùng trên ĐƯỜNG TRƯỚC ACK (interactionCreate, trước khi lệnh kịp `deferReply`).
 *
 * VÌ SAO TÁCH RIÊNG thay vì bọc timeout thẳng vào `getJail`: 4 nơi gọi còn lại nằm trong
 * `lib/pig.js` và `lib/plant.js`, tức BÊN TRONG lệnh đã defer xong. Ở đó không có hạn 3
 * giây, và fail-open sẽ là đổi hành vi tiền bạc (cho người đang bị giam đi trộm) — không
 * cần thiết và không nên. Nên chính sách fail-open chỉ áp cho đường trước ack.
 *
 * FAIL-OPEN: quá hạn (hoặc DB lỗi) thì coi như KHÔNG bị giam. Đánh đổi có chủ ý:
 *  · fail-open  -> lúc DB chập chờn, một người đang bị giam có thể lọt một lượt /work.
 *  · fail-closed -> lúc DB chập chờn, MỌI người chơi bình thường bị chặn oan khỏi 18 lệnh
 *                   chính (work, fish, daily, toàn bộ trò cược, rob).
 * Cái giá của fail-closed lớn hơn nhiều, nên chọn fail-open.
 */
async function getJailForAck(userId, ms = ACK_LOOKUP_TIMEOUT) {
    const kq = await withTimeout(getJail(userId), ms);
    // `undefined` = hết giờ hoặc lỗi (withTimeout nuốt cả hai). `null` = DB trả về "không bị
    // giam". Phân biệt được nên chỗ hết giờ vẫn ghi log để còn quan sát được.
    if (kq === undefined) {
        console.warn(`[JAIL] Tra cứu quá ${ms}ms cho ${userId} -> fail-open (cho qua) để lệnh kịp ack.`);
        return null;
    }
    return kq;
}

module.exports = { JAIL_BLOCKED, isBlocked, getJail, getJailForAck };

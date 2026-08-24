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

// ---------------------------------------------------------------------------
// BỘ NHỚ GIAM — giữ trong RAM, giống hệt `lib/bans.js`.
//
// VÌ SAO ĐỔI (24-08): trước đây mỗi lệnh trong 18 lệnh trên phải TRA DB trước khi kịp ack,
// và chính lời tra đó là thứ đẻ ra dòng `[JAIL] Tra cứu quá 800ms -> fail-open` trong log.
// Đo lại thì hoá ra nó canh một tính năng chưa từng chạy:
//   · `/rob` KHÔNG hề giam ai — nó gọi `chargeAssets`, chỉ phạt tiền.
//   · Chỉ `lib/pig.js` và `lib/plant.js` gọi `jailOrFine`, tức chỉ trộm heo/cây mới giam.
//   · Tại thời điểm đo: 0/391 người từng bị giam, và ledger chưa ghi nhận lượt trộm nào.
// Một vòng DB nằm chắn đường nóng nhất của bot để canh việc chưa xảy ra lần nào.
//
// VÌ SAO GIỮ TRONG RAM LÀ ĐỦ: `jailed_until` chỉ được ghi bởi RPC `jail_or_fine`, mà RPC
// đó chỉ được gọi từ hai chỗ nói trên — CÙNG tiến trình này. Web không đụng tới jail, và
// không có lệnh gỡ giam nào (giam chỉ hết theo thời gian). Nên bản đồ dưới đây là đầy đủ,
// miễn là nạp được lúc khởi động.
//
// ĐÁNH ĐỔI PHẢI BIẾT — SHARDING: `shard.js` có sẵn trong repo. Nếu sau này chạy nhiều shard
// thật, người bị giam ở shard này vẫn chơi được ở shard kia cho tới lần khởi động sau, vì
// bản đồ nằm trong RAM của từng tiến trình. `lib/bans.js` hiện cũng chịu đúng hạn chế đó.
// Khi bật sharding, cách chữa là làm mới định kỳ (hoặc phát tin qua broker giữa các shard).
//
// FAIL-OPEN vẫn giữ nguyên tinh thần cũ: `loadJails()` lỗi -> bản đồ rỗng -> coi như không
// ai bị giam. Đánh đổi có chủ ý, y như trước: chặn oan MỌI người chơi khỏi 18 lệnh chính
// đắt hơn nhiều so với việc một người đang bị giam lọt một lượt /work.
// ---------------------------------------------------------------------------
const giam = new Map(); // userId -> { until: number(ms), reason: string|null }

/** Nạp danh sách đang bị giam từ DB (gọi lúc khởi động). Trả về số người. */
async function loadJails() {
    const rows = await db.getJailedUsers();
    giam.clear();
    const now = Date.now();
    for (const r of rows) {
        const until = new Date(r.jailed_until).getTime();
        if (until > now) giam.set(r.user_id, { until, reason: r.jail_reason ?? null });
    }
    return giam.size;
}

/**
 * Kiểm tra ĐỒNG BỘ, KHÔNG chạm DB — dùng được trên đường trước ack.
 * @returns {{until:number, reason:string|null}|null}
 */
function isJailed(userId) {
    const r = giam.get(userId);
    if (!r) return null;
    // Tự dọn khi hết hạn: không cần cron, và không để bản đồ phình theo thời gian.
    if (r.until <= Date.now()) { giam.delete(userId); return null; }
    return r;
}

/**
 * Đọc lại DB rồi đồng bộ vào RAM — gọi sau khi vừa giam ai đó.
 *
 * VÌ SAO ĐỌC LẠI thay vì tự ghi mốc đã tính sẵn: bảo hiểm `bh_hoc_duong` gọi `halveJail()`
 * để giảm nửa án, mà RPC `halve_jail` KHÔNG trả về mốc mới. Tự ghi mốc thì RAM giữ án đầy
 * trong khi DB đã giảm — người chơi bị giam lâu hơn mức đáng phải chịu, và không ai thấy
 * sai ở đâu. Đường này nằm sau ack và cực hiếm (0 lượt tính tới 24-08) nên một vòng đọc
 * là miễn phí. Thiếu hẳn bước này thì người vừa bị giam vẫn chơi tiếp tới lần khởi động sau.
 */
async function refreshJail(userId) {
    const j = await getJail(userId);
    if (j) giam.set(userId, { until: j.until, reason: j.reason ?? null });
    else giam.delete(userId);
    return j;
}

/** Trả { until:number(ms), reason } nếu đang bị giam, ngược lại null. ĐỌC THẲNG DB. */
async function getJail(userId) {
    const row = await db.getJail(userId);
    if (!row || !row.jailed_until) return null;
    const until = new Date(row.jailed_until).getTime();
    if (!until || until <= Date.now()) return null;
    return { until, reason: row.jail_reason };
}

module.exports = {
    JAIL_BLOCKED, isBlocked,
    loadJails, isJailed, refreshJail,
    // `getJail` ĐỌC DB, chỉ dùng ở nơi đã ack xong (lib/pig.js, lib/plant.js). Đừng gọi nó
    // trên đường trước ack — đó chính là cái vừa được gỡ đi. Dùng `isJailed` ở đó.
    getJail,
    // Lộ ra cho test: bản đồ trong RAM là thứ dễ hỏng thầm lặng nhất ở đây (quên dọn khi
    // hết hạn -> giam vĩnh viễn; quên `refreshJail` -> giam xong vẫn chơi được).
    _giam: { size: () => giam.size, xoaHet: () => giam.clear() },
};

// ============================================================
// lib/demThanhVien.js — tách NGƯỜI THẬT khỏi BOT mà không tốn lượt fetch nào.
//
// VÌ SAO KHÔNG `members.fetch()`: nó ghi toàn bộ thành viên vào cache, đá thẳng vào
// sweeper 60 phút thêm ở `18543c3`, và trên VPS 384MB thì một server 3.300 người là
// cả một vấn đề. Mục đích con số này chỉ là để CHỦ BOT phân tích chủ động — không
// đáng đổi bằng RAM.
//
// CÁCH RẺ: mỗi bot vào server đều được Discord tạo một role quản lý mang `tags.botId`.
// Đếm số role đó = số bot, lấy từ `roles.cache` vốn đã có sẵn từ payload GUILD_CREATE.
//
// ĐÃ NGHIỆM THU (T15, 22-10-2026, 5 server đông nhất, đối chiếu với danh sách thành
// viên đầy đủ lấy qua REST có phân trang):
//     server 3.330 người -> lệch 0      ·  770 -> lệch 1
//     276 -> lệch 2                     ·  260 -> lệch 1   ·  251 -> lệch 0
//     tổng: 4.706 người thật · 181 bot · lệch 4 = 2,2%
// Lệch đến từ bot cũ gia nhập trước khi Discord bắt buộc tạo role quản lý.
//
// BẪY ĐÃ MẮC khi nghiệm thu: lượt đo đầu KHÔNG phân trang, REST trả tối đa 1000
// thành viên/trang, nên server 3.330 người báo "lệch 12" và tôi đã kết luận phép xấp
// xỉ KHÔNG đạt. Đó là lỗi của phép đo. Đo lại có `after=` thì lệch đúng 0.
// ============================================================

/** Số bot trong một guild, xấp xỉ bằng role quản lý. 0 lượt fetch. */
function demBot(guild) {
    try {
        return guild.roles.cache.filter((r) => r.tags && r.tags.botId).size;
    } catch {
        return 0;
    }
}

/**
 * Tách người/bot cho MỘT guild.
 * `memberCount` luôn có từ GUILD_CREATE, không cần intent GUILD_MEMBERS.
 * @returns {{tong: number, bot: number, nguoi: number}}
 */
function demGuild(guild) {
    const tong = Number(guild?.memberCount) || 0;
    const bot = Math.min(demBot(guild), tong); // không để bot nhiều hơn tổng
    return { tong, bot, nguoi: Math.max(0, tong - bot) };
}

/** Gộp toàn bộ guild mà TIẾN TRÌNH NÀY thấy. Khi sharding, đây là phần của shard này. */
function demTienTrinh(client) {
    let tong = 0;
    let bot = 0;
    for (const g of client.guilds.cache.values()) {
        const d = demGuild(g);
        tong += d.tong;
        bot += d.bot;
    }
    return { servers: client.guilds.cache.size, tong, bot, nguoi: Math.max(0, tong - bot) };
}

/**
 * Nhãn shard dạng `0/1`.
 *
 * `client.shard` là `null` ở prod (chạy `index.js` trực tiếp, không qua `shard.js`), nên
 * `client.shard.ids` sẽ NÉM TypeError — phải rẽ nhánh trước khi chạm vào nó.
 */
function nhanShard(client) {
    if (client.shard) return `${client.shard.ids.join(',')}/${client.shard.count}`;
    const ids = [...client.ws.shards.keys()];
    return `${ids.length ? ids.join(',') : 0}/${Math.max(1, ids.length)}`;
}

/** Một dòng console lúc khởi động — số liệu để chủ bot tự phân tích. */
function dongConsole(client) {
    const d = demTienTrinh(client);
    const n = (x) => x.toLocaleString('en-US');
    return `[STATS] ${n(d.servers)} server · ${n(d.nguoi)} người thật · ${n(d.bot)} bot`
        + ` · ${n(d.tong)} tổng thành viên · shard ${nhanShard(client)}`;
}

/**
 * Tham số cho chuỗi i18n. Tồn tại vì tên khoá trong locale là tiếng Anh (`{humans}`,
 * `{bots}`) còn hàm đếm trả tên tiếng Việt — truyền thẳng `demGuild()` vào `t()` thì
 * placeholder KHÔNG được thay và người chơi đọc đúng chữ "{humans}". Vẫn một nguồn số.
 */
function thamSoI18n(guild) {
    const d = demGuild(guild);
    return { humans: d.nguoi, bots: d.bot, total: d.tong };
}

module.exports = { demBot, demGuild, thamSoI18n, demTienTrinh, nhanShard, dongConsole };

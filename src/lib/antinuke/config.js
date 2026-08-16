// ============================================================
// lib/antinuke/config.js — Cấu hình chống nuke, đọc được từ RAM trong 0 ms.
//
// LUẬT SỐ 1 CỦA CẢ HỆ (docs/spec-antinuke.md §2.1): **đường nóng không await Supabase.**
// Khi server đang bị nuke, mỗi 300 ms là một kênh nữa mất. Repo này đã có tiền sử
// Supabase chập chờn ăn hết 3 s và làm hỏng interaction (lý do src/lib/i18n.js phải
// cache). Nếu handler audit-log phải hỏi DB "server này có bật anti-nuke không" thì
// đúng lúc DB chậm cũng là lúc lá chắn biến mất.
//
// Vì vậy: `get()` là HÀM ĐỒNG BỘ, chỉ đọc Map trong RAM. Việc nạp DB xảy ra ở
// `warm()` (lúc ready, cho mọi guild) và refresh nền theo TTL.
//
// `null` từ DB (mất kết nối) KHÔNG được hiểu là "tắt": ta giữ nguyên bản cache cũ.
// Nhầm hai thứ đó = lá chắn tự tắt đúng lúc dễ bị tấn công nhất.
// ============================================================
const db = require('../../database.js');
const { ANTINUKE } = require('../../config');

// guildId -> { enabled, mode, config, mtNguoi:Set, mtRole:Set, disableAt, loaded, exp }
const cache = new Map();
const inflight = new Set();

const MAC_DINH = Object.freeze({
    enabled: false,
    mode: 'dryrun',
    config: {},
    mtNguoi: new Set(),
    mtRole: new Set(),
    disableAt: 0,
    loaded: false,
    exp: 0,
});

function chuanHoa(raw) {
    const conf = (raw && typeof raw.config === 'object' && raw.config) || {};
    // Tách miễn trừ theo NGƯỜI và theo ROLE: chỉ khi có miễn trừ theo role thì đường
    // nóng mới phải bỏ tiền ra fetch member (xem `duocMienTru`).
    const mtNguoi = new Set();
    const mtRole = new Set();
    for (const e of Array.isArray(raw?.whitelist) ? raw.whitelist : []) {
        if (!e?.id) continue;
        (e.kind === 'role' ? mtRole : mtNguoi).add(String(e.id));
    }
    return {
        enabled: Boolean(raw?.enabled),
        mode: raw?.mode === 'enforce' ? 'enforce' : 'dryrun',
        config: conf,
        mtNguoi,
        mtRole,
        disableAt: Number(conf.disable_at || 0),
        loaded: true,
        exp: Date.now() + ANTINUKE.CONFIG_TTL_MS,
    };
}

/**
 * Đọc cấu hình đã cache. ĐỒNG BỘ, không I/O.
 * Chưa từng nạp -> trả mặc định TẮT và kích hoạt nạp nền (lần sau đã có).
 */
function get(guildId) {
    const e = cache.get(guildId);
    if (!e) {
        refresh(guildId);
        return MAC_DINH;
    }
    if (e.exp <= Date.now()) refresh(guildId); // hết hạn: dùng bản cũ NGAY, làm mới ở nền
    return e;
}

/** Anti-nuke có thực sự đang bảo vệ guild này không (đã tính độ trễ tắt). */
function dangBaoVe(guildId) {
    const e = get(guildId);
    if (!e.enabled) return false;
    if (e.disableAt && Date.now() >= e.disableAt) return false; // lệnh tắt đã tới hạn
    return true;
}

/** Đang ở chế độ thi hành thật (khác dry-run chỉ ghi log). */
function dangThiHanh(guildId) {
    return dangBaoVe(guildId) && get(guildId).mode === 'enforce';
}

/** Người này (hoặc một role của họ) được miễn trừ? */
function duocMienTru(guildId, userId, roleIds = []) {
    const e = get(guildId);
    if (e.mtNguoi.has(String(userId))) return true;
    if (!e.mtRole.size) return false;
    return roleIds.some(r => e.mtRole.has(String(r)));
}

/**
 * Guild có miễn trừ theo ROLE không.
 * Đường nóng dùng cờ này để quyết định có đáng bỏ ~100 ms fetch member hay không:
 * không có miễn trừ theo role thì danh sách role của kẻ thực thi hoàn toàn vô nghĩa.
 */
function coMienTruTheoRole(guildId) {
    return get(guildId).mtRole.size > 0;
}

/** Nạp từ DB vào cache. Không bao giờ ném lỗi. Trùng lời gọi thì gộp. */
async function refresh(guildId) {
    if (inflight.has(guildId)) return cache.get(guildId) || MAC_DINH;
    inflight.add(guildId);
    try {
        const raw = await db.antinukeGet(guildId);
        // raw === null nghĩa là DB LỖI, không phải "chưa cấu hình" (RPC luôn trả object).
        if (raw === null) {
            const cu = cache.get(guildId);
            // Có bản cũ -> GIỮ NGUYÊN nội dung, chỉ đẩy hạn ra. Coi "DB im lặng" là
            // "server này tắt anti-nuke" thì lá chắn tự rơi đúng lúc dễ bị tấn công nhất.
            if (cu) { cu.exp = Date.now() + ANTINUKE.CONFIG_TTL_MS; return cu; }

            // Chưa từng nạp được lần nào: vẫn phải LƯU một bản âm ngắn hạn.
            // Không lưu thì `get()` (đồng bộ) sẽ kích hoạt refresh cho MỌI sự kiện audit
            // — tức là một lượt gọi Supabase cho mỗi kênh bị xoá, đúng vào cửa sổ code đã
            // đẩy mà migration 0119 chưa áp. Bản âm hết hạn sau CONFIG_TTL_MS nên hệ tự
            // hồi phục ngay khi DB sống lại, không cần restart.
            const am = { ...MAC_DINH, mtNguoi: new Set(), mtRole: new Set(), exp: Date.now() + ANTINUKE.CONFIG_TTL_MS };
            cache.set(guildId, am);
            return am;
        }
        const moi = chuanHoa(raw);
        cache.set(guildId, moi);
        return moi;
    } catch {
        return cache.get(guildId) || MAC_DINH;
    } finally {
        inflight.delete(guildId);
    }
}

/** Xoá cache một guild (gọi ngay sau khi `/antinuke` ghi cấu hình). */
async function invalidate(guildId) {
    cache.delete(guildId);
    return refresh(guildId);
}

/**
 * Làm ấm cache cho MỌI guild bot đang ở. Gọi lúc ready.
 * Tuần tự có giãn cách: 1 RTT/guild, không cần nhanh, nhưng không được nện DB.
 */
async function warm(client, spacingMs = 120) {
    let n = 0;
    let hong = 0;
    for (const [guildId] of client.guilds.cache) {
        const kq = await refresh(guildId);
        // `loaded=false` nghĩa là RPC không trả lời được. Ba lần liên tiếp thì gần như
        // chắc chắn là **migration 0119 chưa được áp** chứ không phải mạng chập chờn.
        // Dừng sớm + nói đúng nguyên nhân: nếu cứ chạy tiếp, admin sẽ thấy hàng chục
        // dòng lỗi RPC mơ hồ và mất thời gian tìm nhầm chỗ. Anti-nuke lúc này TẮT.
        if (!kq.loaded) {
            if (++hong >= 3) {
                console.error('[ANTI-NUKE] Không đọc được cấu hình sau 3 server liên tiếp — nhiều khả năng '
                    + 'migration 0119_antinuke.sql CHƯA được áp lên Supabase. Lá chắn đang TẮT.');
                return n;
            }
        } else {
            hong = 0;
        }
        n++;
        if (spacingMs) await new Promise(r => setTimeout(r, spacingMs));
    }
    return n;
}

/** Chỉ dùng cho test. */
function _reset() {
    cache.clear();
    inflight.clear();
}

module.exports = {
    get, dangBaoVe, dangThiHanh, duocMienTru, coMienTruTheoRole,
    refresh, invalidate, warm, _reset, MAC_DINH,
};

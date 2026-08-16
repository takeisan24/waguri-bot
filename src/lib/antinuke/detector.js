// ============================================================
// lib/antinuke/detector.js — Bộ đếm cửa sổ trượt + quyết định.
//
// TOÀN BỘ file này là HÀM THUẦN trên state truyền vào: không chạm Discord, không chạm
// DB, không đọc đồng hồ hệ thống (mọi hàm nhận `now`). Đó là lý do phần não của
// anti-nuke test được bằng `node --test` mà không cần một server Discord thật —
// và cũng là phần duy nhất tuyệt đối không được sai.
//
// Bộ đếm nằm trong RAM có chủ đích: nó phải trả lời trong 0 ms (xem config.js).
// Mất bộ đếm khi bot restart là đánh đổi đã biết; F4 (P1) bù lại bằng cách so
// snapshot lúc `ready`.
// ============================================================
const { PermissionFlagsBits } = require('discord.js');
const { ANTINUKE } = require('../../config');

/** State dùng thật (singleton). Test tự tạo state riêng qua `taoState()`. */
function taoState() {
    return {
        moc: new Map(),      // 'guild:executor:action' -> number[] (mốc thời gian)
        keTanCong: new Map(),// guildId -> Map<executorId, number> (lần kích hoạt gần nhất)
    };
}
const stateChung = taoState();

function khoa(guildId, executorId, action) {
    return `${guildId}:${executorId}:${action}`;
}

/**
 * Ghi một lần thực hiện hành vi và trả về SỐ LẦN trong cửa sổ (đã tính lần này).
 * Cửa sổ trượt thật: mốc cũ hơn `windowMs` bị loại trước khi đếm.
 */
function ghiNhan(state, guildId, executorId, action, now, windowMs, cap = ANTINUKE.BUCKET_CAP) {
    const k = khoa(guildId, executorId, action);
    const cu = state.moc.get(k) || [];
    const nguong = now - windowMs;
    let ds = cu.filter(t => t > nguong);
    ds.push(now);
    // Trần chống phình RAM: kẻ tấn công xoá 500 kênh không được biến Map thành 500 số.
    if (ds.length > cap) ds = ds.slice(-cap);
    state.moc.set(k, ds);
    return ds.length;
}

/**
 * Vượt ngưỡng chưa? Trả `null` nếu chưa, hoặc quyết định nếu đã.
 * KHÔNG quyết định hình phạt cuối ở đây — chỉ nói "luật nào bị phá".
 */
function danhGia(action, hits, rules = ANTINUKE.RULES) {
    const luat = rules[action];
    if (!luat) return null;
    if (hits < luat.limit) return null;
    return {
        action,
        hits,
        limit: luat.limit,
        windowMs: luat.windowMs,
        verdict: luat.verdict,
        lockdown: Boolean(luat.lockdown),
    };
}

/** Gộp hai bước trên — đường dùng thật. */
function xetHanhVi(guildId, executorId, action, now, rules = ANTINUKE.RULES, state = stateChung) {
    const luat = rules[action];
    if (!luat) return null;
    const hits = ghiNhan(state, guildId, executorId, action, now, luat.windowMs);
    return danhGia(action, hits, rules);
}

/**
 * Ghi nhận một kẻ tấn công vừa bị bắt và trả về SỐ KẺ TẤN CÔNG KHÁC NHAU của guild
 * trong `windowMs`. Từ 2 người trở lên = nghi chiếm tài khoản hàng loạt, không còn là
 * "một admin phản" -> leo thang sang cách ly diện rộng.
 */
function demKeTanCong(guildId, executorId, now, windowMs = ANTINUKE.PANIC_WINDOW_MS, state = stateChung) {
    let m = state.keTanCong.get(guildId);
    if (!m) { m = new Map(); state.keTanCong.set(guildId, m); }
    m.set(executorId, now);
    for (const [id, t] of m) if (now - t > windowMs) m.delete(id);
    return m.size;
}

/**
 * Quyền NGUY HIỂM vừa được THÊM khi so hai bitfield quyền.
 * Trả mảng tên quyền (rỗng = không có leo thang) — dùng cho cả RoleUpdate lẫn
 * MemberRoleUpdate (gộp quyền các role được gán).
 */
function quyenNguyHiemMoi(quyenCu, quyenMoi, danhSach = ANTINUKE.DANGEROUS_PERMS) {
    let a, b;
    try {
        a = BigInt(quyenCu ?? 0);
        b = BigInt(quyenMoi ?? 0);
    } catch {
        return [];
    }
    const them = b & ~a;
    if (them === 0n) return [];
    return danhSach.filter(ten => {
        const bit = PermissionFlagsBits[ten];
        return bit !== undefined && (them & bit) === bit;
    });
}

/** Dọn bộ đếm nguội. Gọi định kỳ để Map không phình theo số server phục vụ. */
function quetRac(now, maxAgeMs = ANTINUKE.PANIC_WINDOW_MS * 10, state = stateChung) {
    let xoa = 0;
    for (const [k, ds] of state.moc) {
        if (!ds.length || now - ds[ds.length - 1] > maxAgeMs) { state.moc.delete(k); xoa++; }
    }
    for (const [g, m] of state.keTanCong) {
        for (const [id, t] of m) if (now - t > maxAgeMs) m.delete(id);
        if (!m.size) state.keTanCong.delete(g);
    }
    return xoa;
}

module.exports = {
    taoState, stateChung,
    ghiNhan, danhGia, xetHanhVi, demKeTanCong, quyenNguyHiemMoi, quetRac,
};

// ============================================================
// lib/antinuke/lockdown.js — Khoá server (và mở lại).
//
// Khoá KHÔNG phải để "trừng phạt server" mà để bịt ba đường tiếp diễn sau khi kẻ
// tấn công đầu tiên đã bị tước quyền:
//   1. Tắt invite   — chặn đợt raid gọi thêm người
//   2. Verification HIGH — acc mới tạo không nói/không tương tác được
//   3. Gỡ quyền nguy hiểm khỏi @everyone — bịt kịch bản tệ nhất: nuker cấp
//      Administrator cho @everyone rồi bỏ đi, lúc đó AI CŨNG nuke tiếp được
//
// TRẠNG THÁI CŨ ĐƯỢC LƯU XUỐNG DB, không chỉ trong RAM: nếu bot restart trong lúc
// server đang khoá (host free restart bất kỳ lúc nào — xem watchdog ở index.js) mà
// trạng thái cũ chỉ nằm trong RAM thì server kẹt ở chế độ khoá vĩnh viễn và không ai
// biết giá trị ban đầu để trả về.
// ============================================================
const { PermissionFlagsBits, GuildVerificationLevel } = require('discord.js');
const db = require('../../database.js');
const cache = require('./config');
const { ANTINUKE } = require('../../config');
const { logError } = require('../logger');

const bitNguyHiem = () => ANTINUKE.DANGEROUS_PERMS
    .map(n => PermissionFlagsBits[n])
    .filter(Boolean)
    .reduce((a, b) => a | b, 0n);

// Chốt trong RAM, đặt NGAY khi bắt đầu khoá. Cache cấu hình chỉ cập nhật sau một lượt
// đi về DB, nên trong một đợt tấn công dồn dập, hai lời gọi `khoa()` song song đều thấy
// "chưa khoá" và lời gọi thứ hai ghi đè bản ghi trạng thái cũ bằng trạng thái ĐÃ KHOÁ —
// từ đó `/antinuke lockdown off` khôi phục về chính trạng thái khoá, server kẹt vĩnh viễn.
const khoaRAM = new Set();

/** Server này có đang bị anti-nuke khoá không (đọc từ cache cấu hình, 0 I/O). */
function dangKhoa(guildId) {
    return Boolean(cache.get(guildId).config?.lockdown_state);
}

/**
 * Khoá server. Trả { daLam:[...], truocDo:{...} }.
 * Mỗi bước độc lập: bước nào thiếu quyền thì bỏ qua bước đó, KHÔNG bỏ cả quy trình.
 */
async function khoa(guild, lyDo) {
    // Đã có bản ghi trạng thái cũ (dù từ lần khoá trước hay từ lời gọi song song) thì
    // TUYỆT ĐỐI không ghi đè. Các bước khoá bên dưới vẫn chạy — chúng idempotent.
    const daCoBanGhi = dangKhoa(guild.id) || khoaRAM.has(guild.id);
    khoaRAM.add(guild.id);

    const daLam = [];
    const truocDo = {
        invitesDisabled: guild.features?.includes('INVITES_DISABLED') || false,
        verificationLevel: guild.verificationLevel,
        everyonePerms: null,
    };

    try {
        if (!truocDo.invitesDisabled) {
            await guild.disableInvites(true);
            daLam.push('invites');
        }
    } catch { /* thiếu ManageGuild — bước sau vẫn phải chạy */ }

    try {
        if (guild.verificationLevel < GuildVerificationLevel.High) {
            await guild.setVerificationLevel(GuildVerificationLevel.High, lyDo);
            daLam.push('verification');
        }
    } catch { /* bỏ qua */ }

    try {
        const everyone = guild.roles.everyone;
        const cu = everyone.permissions.bitfield;
        const sach = cu & ~bitNguyHiem();
        if (sach !== cu) {
            truocDo.everyonePerms = String(cu);
            await everyone.setPermissions(sach, lyDo);
            daLam.push('everyone_perms');
        }
    } catch { /* bỏ qua */ }

    // Không khoá được bước nào (thiếu quyền, hoặc server vốn đã ở trạng thái đó) và cũng
    // chưa có bản ghi -> NHẢ chốt RAM. Giữ chốt trong trường hợp này sẽ khiến lần khoá
    // THẬT sau đó tưởng đã có bản ghi và không bao giờ lưu trạng thái gốc.
    if (!daLam.length && !daCoBanGhi) khoaRAM.delete(guild.id);

    // Ghi trạng thái cũ SAU khi đã hành động (đường nóng không chờ DB).
    if (daLam.length && !daCoBanGhi) {
        const kq = await db.antinukeSetConfig(guild.id, 'lockdown_state', JSON.stringify(truocDo));
        // Ghi hỏng thì server vẫn được khoá (an toàn), nhưng KHÔNG mở lại tự động được.
        // Phải hét lên, nếu không chủ server sẽ ngồi tìm mãi vì sao `lockdown off` báo
        // "server không bị khoá" trong khi invite vẫn tắt.
        if (kq !== 'ok') logError('antinuke_lockdown_luu_trang_thai', new Error(kq), { guild: guild.id });
        await cache.invalidate(guild.id);
    }

    return { daLam, truocDo };
}

/**
 * Mở khoá, trả server về đúng giá trị trước khi khoá.
 * Không có trạng thái đã lưu -> trả 'khong_khoa' thay vì đoán bừa: đặt verification
 * về NONE cho một server vốn để MEDIUM là tự tay hạ hàng rào của người ta.
 */
async function moKhoa(guild) {
    const thoJSON = cache.get(guild.id).config?.lockdown_state;
    if (!thoJSON) {
        khoaRAM.delete(guild.id); // dọn chốt lạc, tránh kẹt trạng thái sau restart/khoá hụt
        return { ok: false, reason: 'khong_khoa' };
    }

    let truocDo;
    try {
        truocDo = JSON.parse(thoJSON);
    } catch {
        return { ok: false, reason: 'trang_thai_hong' };
    }

    const daTra = [];
    try {
        if (!truocDo.invitesDisabled) {
            await guild.disableInvites(false);
            daTra.push('invites');
        }
    } catch { /* bỏ qua */ }

    try {
        if (typeof truocDo.verificationLevel === 'number' && guild.verificationLevel !== truocDo.verificationLevel) {
            await guild.setVerificationLevel(truocDo.verificationLevel, 'Waguri anti-nuke: mở khoá');
            daTra.push('verification');
        }
    } catch { /* bỏ qua */ }

    try {
        if (truocDo.everyonePerms) {
            await guild.roles.everyone.setPermissions(BigInt(truocDo.everyonePerms), 'Waguri anti-nuke: mở khoá');
            daTra.push('everyone_perms');
        }
    } catch { /* bỏ qua */ }

    await db.antinukeSetConfig(guild.id, 'lockdown_state', '');
    khoaRAM.delete(guild.id);
    await cache.invalidate(guild.id);
    return { ok: true, daTra };
}

module.exports = { khoa, moKhoa, dangKhoa };

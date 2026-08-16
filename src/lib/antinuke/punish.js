// ============================================================
// lib/antinuke/punish.js — Đòn quyết định.
//
// THỨ TỰ ƯU TIÊN CÓ CHỦ Ý: hành động đáng giá nhất không phải ban, mà là **tước
// sạch role** (`roles.set`). Nó tốn đúng 1 lệnh API, cắt ngay khả năng gây hại, và
// hồi phục được nếu hoá ra là dương tính giả. Ban là bước sau.
//
// THANG TỤT DẦN: nếu bậc yêu cầu thất bại (thiếu quyền / thứ bậc role), tự tụt xuống
// bậc thấp hơn thay vì bỏ cuộc. Trường hợp thật đã gặp: bot có ManageRoles nhưng chủ
// server quên cấp BanMembers -> ban hỏng, nhưng tước role vẫn cứu được server.
//
// KHÔNG BAO GIỜ ném lỗi ra ngoài (luật AGENTS.md §2.6): trả object kết quả để tầng
// trên còn biết đường báo động "đã phát hiện nhưng KHÔNG chặn được".
// ============================================================
const { PermissionFlagsBits } = require('discord.js');

/** Bậc nào cần quyền gì của bot. */
const QUYEN_CAN = {
    strip: PermissionFlagsBits.ManageRoles,
    kick: PermissionFlagsBits.KickMembers,
    ban: PermissionFlagsBits.BanMembers,
};

/** Thang tụt dần theo bậc yêu cầu. `strip` không leo lên — nó là bậc nhẹ nhất có chủ đích. */
function thang(verdict, laBot) {
    if (laBot) {
        // Bot mang role tích hợp `managed` — KHÔNG gỡ được. Tước role với bot là vô nghĩa,
        // phải đá/cấm thì mới thực sự chặn.
        return verdict === 'ban' ? ['ban', 'kick'] : ['kick', 'ban'];
    }
    if (verdict === 'ban') return ['ban', 'kick', 'strip'];
    if (verdict === 'kick') return ['kick', 'strip'];
    return ['strip'];
}

async function tuocRole(member, lyDo) {
    // Giữ lại role `managed` (role tích hợp của bot/booster) — Discord từ chối gỡ chúng,
    // đưa vào payload sẽ làm hỏng CẢ lệnh.
    const giuLai = member.roles.cache.filter(r => r.managed).map(r => r.id);
    const daGo = member.roles.cache.filter(r => !r.managed && r.id !== member.guild.id).map(r => r.id);
    if (!daGo.length) return { ok: true, roles: [] };
    await member.roles.set(giuLai, lyDo);
    return { ok: true, roles: daGo };
}

/**
 * Thi hành hình phạt lên kẻ tấn công.
 * @returns {Promise<{ok:boolean, applied:string|null, reason:string, roles?:string[]}>}
 *   reason: 'ok' | 'self' | 'owner' | 'hierarchy' | 'missing_perm' | 'not_found' | 'error'
 */
async function trungPhat(guild, executorId, verdict, lyDo) {
    try {
        // 1. Không tự cắn mình — nếu không, một lần khôi phục của bot sẽ tự kết án bot.
        if (executorId === guild.client.user.id) return { ok: false, applied: null, reason: 'self' };

        // 2. Chủ server đứng trên mọi thứ, kể cả bot. Không giả vờ làm được.
        if (executorId === guild.ownerId) return { ok: false, applied: null, reason: 'owner' };

        const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
        if (!me) return { ok: false, applied: null, reason: 'error' };

        const member = await guild.members.fetch(executorId).catch(() => null);

        // 3. Thứ bậc role: Discord từ chối mọi thao tác lên người ngang/cao hơn bot.
        //    Phát hiện SỚM để báo đúng nguyên nhân thay vì để API trả 50013 mơ hồ.
        if (member && member.roles.highest.position >= me.roles.highest.position) {
            return { ok: false, applied: null, reason: 'hierarchy' };
        }

        const laBot = Boolean(member?.user?.bot);
        let thieuQuyen = false;

        for (const bac of thang(verdict, laBot)) {
            if (!me.permissions.has(QUYEN_CAN[bac])) { thieuQuyen = true; continue; }
            if ((bac === 'strip' || bac === 'kick') && !member) continue; // đã rời server

            try {
                if (bac === 'strip') {
                    const r = await tuocRole(member, lyDo);
                    return { ok: true, applied: 'strip', reason: 'ok', roles: r.roles };
                }
                if (bac === 'kick') {
                    await member.kick(lyDo);
                    return { ok: true, applied: 'kick', reason: 'ok' };
                }
                await guild.bans.create(executorId, { reason: lyDo, deleteMessageSeconds: 0 });
                return { ok: true, applied: 'ban', reason: 'ok' };
            } catch {
                // Bậc này hỏng -> thử bậc thấp hơn. Không log ở đây: tầng trên sẽ báo
                // động một lần với kết quả cuối cùng, tránh spam webhook giữa cuộc tấn công.
                continue;
            }
        }

        if (!member) return { ok: false, applied: null, reason: 'not_found' };
        return { ok: false, applied: null, reason: thieuQuyen ? 'missing_perm' : 'error' };
    } catch {
        return { ok: false, applied: null, reason: 'error' };
    }
}

module.exports = { trungPhat, thang, tuocRole };

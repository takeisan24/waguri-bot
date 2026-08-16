// ============================================================
// events/guildAuditLogEntryCreate.js — Trạm trung tâm của hệ chống nuke.
//
// Đây là event DUY NHẤT cho biết **AI** vừa xoá kênh/ban người, ngay tại thời điểm nó
// xảy ra. Không có nó thì chỉ còn cách gọi `fetchAuditLogs()` sau mỗi lần xoá — vừa
// chậm, vừa dính rate limit đúng lúc đang bị dội hàng loạt.
//
// HAI ĐIỀU KIỆN BẮT BUỘC (thiếu một là toàn hệ im lặng, không báo lỗi gì):
//   1. Intent `GuildModeration` — event này nằm dưới intent đó (đã thêm ở index.js).
//      Nó KHÔNG phải privileged intent, khỏi động vào Developer Portal.
//   2. Bot có quyền **View Audit Log** trong server. `/antinuke check` kiểm tra điều này.
//
// File này CỐ Ý chỉ làm một việc: dịch mã audit log của Discord sang "hành vi" của
// hệ luật. Toàn bộ quyết định nằm ở src/lib/antinuke/index.js.
// ============================================================
const { AuditLogEvent } = require('discord.js');
const antinuke = require('../lib/antinuke');
const { quyenNguyHiemMoi } = require('../lib/antinuke/detector');
const { logError } = require('../lib/logger');

/** Mã audit log -> khoá luật, cho các loại chỉ cần ánh xạ thẳng. */
const ANH_XA = {
    [AuditLogEvent.ChannelCreate]: 'channel_create',
    [AuditLogEvent.ChannelDelete]: 'channel_delete',
    [AuditLogEvent.RoleCreate]: 'role_create',
    [AuditLogEvent.RoleDelete]: 'role_delete',
    [AuditLogEvent.MemberBanAdd]: 'member_ban',
    [AuditLogEvent.MemberKick]: 'member_kick',
    [AuditLogEvent.MemberPrune]: 'member_prune',
    [AuditLogEvent.BotAdd]: 'bot_add',
    [AuditLogEvent.WebhookCreate]: 'webhook_create',
    [AuditLogEvent.GuildUpdate]: 'guild_update',
    [AuditLogEvent.EmojiDelete]: 'emoji_delete',
    [AuditLogEvent.StickerDelete]: 'emoji_delete',
};

function timThayDoi(entry, key) {
    return (entry.changes || []).find(c => c.key === key);
}

module.exports = {
    name: 'guildAuditLogEntryCreate',
    async execute(entry, guild) {
        try {
            if (!guild || !entry?.executorId) return;

            // --- Sửa role: chỉ quan tâm khi có quyền NGUY HIỂM được THÊM ---------
            // Đổi tên/màu role là việc thường ngày; cấp Administrator thì không.
            if (entry.action === AuditLogEvent.RoleUpdate) {
                const ch = timThayDoi(entry, 'permissions');
                if (!ch) return;
                const them = quyenNguyHiemMoi(ch.old, ch.new);
                if (!them.length) return;
                return void antinuke.xuLy(guild, entry.executorId, 'perm_escalate', {
                    roleId: entry.targetId,
                    quyenCu: ch.old,
                    quyenThem: them,
                });
            }

            // --- Gán role cho thành viên: nguy hiểm khi role đó có quyền nguy hiểm -
            if (entry.action === AuditLogEvent.MemberRoleUpdate) {
                const them = timThayDoi(entry, '$add');
                if (!them?.new?.length) return;
                const idNguyHiem = [];
                for (const r of them.new) {
                    const role = guild.roles.cache.get(r.id);
                    if (!role) continue;
                    // So với bitfield 0: "role này có sẵn quyền nguy hiểm nào".
                    if (quyenNguyHiemMoi(0n, role.permissions.bitfield).length) idNguyHiem.push(r.id);
                }
                if (!idNguyHiem.length) return;
                return void antinuke.xuLy(guild, entry.executorId, 'perm_escalate', {
                    targetId: entry.targetId,
                    roleIds: idNguyHiem,
                });
            }

            const action = ANH_XA[entry.action];
            if (!action) return;

            await antinuke.xuLy(guild, entry.executorId, action, {
                targetId: entry.targetId,
                webhookId: action === 'webhook_create' ? entry.targetId : undefined,
                changes: action === 'guild_update' ? entry.changes : undefined,
            });
        } catch (e) {
            logError('guildAuditLogEntryCreate', e, { guild: guild?.id });
        }
    },
};

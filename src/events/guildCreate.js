const { Events, EmbedBuilder, PermissionsBitField, ChannelType, AuditLogEvent } = require('discord.js');
const config = require('../config');

module.exports = {
    name: Events.GuildCreate,
    async execute(guild) {
        try {
            const me = guild.members.me;
            const canSend = ch => ch
                && ch.type === ChannelType.GuildText
                && ch.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages);

            const welcomeNames = ['welcome', 'chào-mừng', 'chat-chung', 'general', 'nhà-chung', 'main'];
            let channel = null;

            // 1. Thử tìm kênh có tên phù hợp
            for (const name of welcomeNames) {
                channel = guild.channels.cache.find(c => c.name.toLowerCase().includes(name) && canSend(c));
                if (channel) break;
            }

            // 2. Thử systemChannel
            if (!channel && canSend(guild.systemChannel)) {
                channel = guild.systemChannel;
            }

            // 3. Thử tìm bất kỳ kênh text nào
            if (!channel) {
                channel = guild.channels.cache.find(canSend);
            }
            if (!channel) return;

            const { buildWaguriEmbed, pickWaguriImage } = require('../lib/embed');
            const { getLanguage, t } = require('../lib/i18n');
            const locale = getLanguage(guild.preferredLocale);

            const supportLink = process.env.SUPPORT_INVITE ? t(locale, 'common.guild_create.support_link', { url: process.env.SUPPORT_INVITE }) : '';

            const embed = buildWaguriEmbed({ client: guild.client }, 'info', {
                title: t(locale, 'common.guild_create.welcome_title'),
                thumbnail: pickWaguriImage('MAIN'),
                description: t(locale, 'common.guild_create.welcome_desc', { guild: guild.name, supportLink }),
            });
            embed.setFooter({
                text: t(locale, 'common.guild_create.welcome_footer', { prefix: config.PREFIX }),
                iconURL: guild.client.user.displayAvatarURL()
            });

            await channel.send({ embeds: [embed] });
            console.log(`[GUILD JOIN] Đã gửi lời chào tới "${guild.name}" (${guild.id})`);
        } catch (error) {
            console.error('[GUILD JOIN] Lỗi gửi lời chào:', error);
        }

        // Tự tạo link mời + DM cho owner mỗi khi bot được mời vào server mới.
        try {
            await dmOwnersInvite(guild);
        } catch (error) {
            console.error('[GUILD JOIN] Lỗi gửi link mời cho owner:', error);
        }
    },
};

// Tạo invite cho server mới rồi DM về cho từng owner (chủ app + OWNER_IDS).
async function dmOwnersInvite(guild) {
    const { getOwnerIds } = require('../lib/owner');
    const { createGuildInvite } = require('../lib/invite');

    const ownerIds = await getOwnerIds(guild.client);
    if (!ownerIds.size) return;

    const result = await createGuildInvite(guild, { reason: 'Auto-invite cho owner khi bot vào server mới' });
    const inviter = await fetchInviter(guild);

    const body = result
        ? `🌸 Bot vừa được mời vào **${guild.name}** (\`${guild.id}\`)${inviter}!\n` +
          `Link để cậu vào lấy feedback đây nè~\n${result.url}\n\n` +
          `📌 Kênh #${result.channel.name} · ⏳ hết hạn sau **24h** · 🎫 dùng **1 lần** · 👥 ${guild.memberCount} thành viên.`
        : `🌸 Bot vừa được mời vào **${guild.name}** (\`${guild.id}\`)${inviter}!\n` +
          `Nhưng bot **không có quyền tạo link mời** ở server này, nên cậu xin admin của họ một link trực tiếp nhé~`;

    for (const id of ownerIds) {
        try {
            const user = await guild.client.users.fetch(String(id));
            await user.send(body);
        } catch { /* owner tắt DM hoặc fetch lỗi -> bỏ qua */ }
    }
    console.log(`[GUILD JOIN] Đã DM link mời "${guild.name}" cho ${ownerIds.size} owner.`);
}

// Lấy tên người đã mời bot (nếu đọc được audit log), để owner biết ai mời.
async function fetchInviter(guild) {
    try {
        const me = guild.members.me;
        if (!me?.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) return '';
        const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 });
        const entry = logs.entries.first();
        if (entry?.target?.id === guild.client.user.id && entry.executor) {
            return ` (người mời: **${entry.executor.tag}**)`;
        }
    } catch { /* không đọc được audit log -> bỏ qua */ }
    return '';
}

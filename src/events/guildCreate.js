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
            const embed = buildWaguriEmbed({ client: guild.client }, 'info', {
                title: '🌸・Xin chào, mình là Waguri!',
                thumbnail: pickWaguriImage('MAIN'),
                description:
                    `*Hân hạnh được chào đón các quý khách ghé thăm tiệm bánh Gekka!* 🍰\n\n` +
                    `Cảm ơn cậu rất nhiều vì đã mời tớ ghé thăm **${guild.name}**! Tớ sẽ là người bạn đồng hành kiêm "quản lý tiệm bánh" siêu năng nổ của cậu đó~\n\n` +
                    `**✨ Các Dịch Vụ Tại Tiệm:**\n` +
                    `> 🎁 **Người mới bắt đầu từ đây:** Gõ \`/start\` để nhận **quà chào mừng** & hướng dẫn nhanh nha!\n` +
                    `> 💬 **Trò chuyện cùng Waguri:** Gõ \`/ask\` hoặc tag tớ để tớ chia sẻ chuyện học ở Kikyo hay làm bánh cùng Rintaro nha!\n` +
                    `> 💼 **Lao động & Kinh tế:** Kiếm tiền mua bánh ngọt qua \`/work\`, nhận trợ cấp \`/daily\`, mua sắm \`/shop\`.\n` +
                    `> 🎲 **Giải trí cùng bạn bè:** Thử sức với \`/taixiu\`, \`/blackjack\`, \`/masoi\` cực kỳ kịch tính.\n` +
                    `> 📜 **Sổ tay hướng dẫn:** Gõ \`/help\` để tớ chỉ dẫn chi tiết cách dùng các lệnh nhé!\n` +
                    (process.env.SUPPORT_INVITE ? `> 🛟 **Cần giúp đỡ?** [Vào server hỗ trợ](${process.env.SUPPORT_INVITE}) nha!\n` : '') +
                    `\n*Hy vọng chúng mình sẽ có những kỷ niệm thật ngọt ngào bên nhau!* 🌸`
            });
            embed.setFooter({
                text: `Hỗ trợ cả tiền tố ${config.PREFIX} (ví dụ: ${config.PREFIX}help) • Cùng chơi vui vẻ nha!`,
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

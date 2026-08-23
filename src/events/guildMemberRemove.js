const { Events } = require('discord.js');
const { buildWaguriEmbed } = require('../lib/embed');
const { logError, skipLog } = require('../lib/logger');
const db = require('../database.js');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        // `member` có thể là PartialGuildMember (người rời khi chưa nằm trong cache),
        // nhưng `member.user` LUÔN có -> chỉ được dựa vào `user`, đừng đụng `member.displayName`.
        if (member.user?.bot) return;

        try {
            const s = await db.getGuildSettings(member.guild.id);

            // Xác định kênh tạm biệt — cùng quy ước với kênh chào mừng:
            // ưu tiên cấu hình, nếu là Server Support thì rơi về systemChannel.
            const supportId = process.env.SUPPORT_GUILD_ID;
            let channel = null;
            if (s.goodbye_channel) {
                channel = member.guild.channels.cache.get(s.goodbye_channel);
            } else if (supportId && member.guild.id === supportId) {
                channel = member.guild.systemChannel;
            }

            if (!channel) {
                // Cùng lý do với guildMemberAdd: chưa cấu hình = bình thường, đừng log.
                if (s.goodbye_channel) {
                    skipLog('Kênh tạm biệt đã cấu hình nhưng không còn tồn tại — chủ server cần đặt lại /setup', { source: 'guildMemberRemove', guildId: member.guild.id, channelId: s.goodbye_channel });
                }
                return;
            }

            const me = member.guild.members.me;
            if (me && !channel.permissionsFor(me)?.has('SendMessages')) {
                skipLog(`Bot thiếu quyền SendMessages trong kênh ${channel.id}`, { source: 'guildMemberRemove', guildId: member.guild.id, channelId: channel.id });
                return;
            }

            const { t } = require('../lib/i18n');
            const locale = s?.language === 'en' ? 'en' : 'vi';

            // KHÔNG dùng <@id>: người đã rời server nên mention hiện ra là "@unknown-user".
            const name = member.user?.globalName || member.user?.username || member.user?.tag || member.id;

            const embed = buildWaguriEmbed({ client: member.client }, 'info', {
                title: t(locale, 'common.goodbye.title'),
                description: t(locale, 'common.goodbye.desc', {
                    user: name,
                    guild: member.guild.name,
                    count: member.guild.memberCount ?? '?',
                }),
            });

            await channel.send({ embeds: [embed] });
        } catch (error) {
            logError('guildMemberRemove', error, { guild: member.guild?.id });
        }
    },
};

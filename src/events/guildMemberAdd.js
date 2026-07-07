const { Events } = require('discord.js');
const { buildWaguriEmbed } = require('../lib/embed');
const { logError, skipLog } = require('../lib/logger');
const db = require('../database.js');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        if (member.user.bot) return;

        try {
            const s = await db.getGuildSettings(member.guild.id);

            // 1. Tự động gán role nếu có cấu hình
            if (s.welcome_role) {
                const role = member.guild.roles.cache.get(s.welcome_role);
                if (role) {
                    await member.roles.add(role).catch(err => {
                        console.error(`[ROLE ERROR] guildMemberAdd: Không thể gán role ${s.welcome_role} cho member ${member.id}`, err);
                    });
                }
            }

            // 2. Xác định kênh chào mừng
            const supportId = process.env.SUPPORT_GUILD_ID;
            let channel = null;
            if (s.welcome_channel) {
                channel = member.guild.channels.cache.get(s.welcome_channel);
            } else if (supportId && member.guild.id === supportId) {
                channel = member.guild.systemChannel;
            }

            if (!channel) {
                skipLog('Không tìm thấy kênh chào mừng (welcome_channel chưa cấu hình hoặc không có systemChannel)', { source: 'guildMemberAdd', guildId: member.guild.id });
                return;
            }

            // Kiểm tra bot có thể gửi tin vào kênh không
            const me = member.guild.members.me;
            if (me && !channel.permissionsFor(me)?.has('SendMessages')) {
                skipLog(`Bot thiếu quyền SendMessages trong kênh ${channel.id}`, { source: 'guildMemberAdd', guildId: member.guild.id, channelId: channel.id });
                return;
            }

            const { t } = require('../lib/i18n');
            const locale = s?.language === 'en' ? 'en' : 'vi';

            const embed = buildWaguriEmbed({ client: member.client }, 'info', {
                title: t(locale, 'common.welcome.title'),
                description: t(locale, 'common.welcome.desc', { user: `<@${member.id}>`, guild: member.guild.name }),
            });

            await channel.send({ embeds: [embed] });
        } catch (error) {
            logError('guildMemberAdd', error, { guild: member.guild.id });
        }
    },
};

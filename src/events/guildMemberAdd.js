const { Events } = require('discord.js');
const { buildWaguriEmbed } = require('../lib/embed');
const { logError } = require('../lib/logger');
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

            if (!channel) return;

            // Kiểm tra bot có thể gửi tin vào kênh không
            const me = member.guild.members.me;
            if (me && !channel.permissionsFor(me)?.has('SendMessages')) return;

            const embed = buildWaguriEmbed({ client: member.client }, 'info', {
                title: '🌸・Chào mừng thành viên mới!',
                description:
                    `**Xin chào <@${member.id}>** — tớ là **Waguri Kaoruko**, quản lý tiệm bánh Gekka! 🍰\n\n` +
                    `Tớ rất vui vì cậu đã ghé thăm **${member.guild.name}** đó~ Cậu sẽ thích ở đây mà!\n\n` +
                    `**Bắt đầu nhé:**\n` +
                    `> 📜 Hãy làm quen với các kênh của server nha.\n` +
                    `> 🎁 Gõ \`/start\` để nhận **quà chào mừng** và bắt đầu hành trình! 🌸\n\n` +
                    `*Chúc cậu có những giây phút thật ngọt ngào bên mọi người~* 💕`,
            });

            await channel.send({ embeds: [embed] });
        } catch (error) {
            logError('guildMemberAdd', error, { guild: member.guild.id });
        }
    },
};

const { Events, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../lib/embed');
const { logError } = require('../lib/logger');
const config = require('../config');

// Ghi chú: auto-role có thể bổ sung sau bằng cách đọc guild setting (vd getGuildSetting(guild.id, 'welcome_role_id'))
// và gán role cho member ở đây — hiện tại bỏ qua để tránh phụ thuộc role-id cứng hoặc cần quyền đặc biệt.

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // Bỏ qua bot
        if (member.user.bot) return;

        // Chỉ chào mừng ở SERVER HỖ TRỢ chính thức — tránh tự đăng tin ở mọi server dùng bot.
        const supportId = process.env.SUPPORT_GUILD_ID;
        if (!supportId || member.guild.id !== supportId) return;

        const channel = member.guild.systemChannel;
        if (!channel) return;

        // Kiểm tra bot có thể gửi tin vào kênh không
        const me = member.guild.members.me;
        if (me && !channel.permissionsFor(me)?.has('SendMessages')) return;

        try {
            const embed = buildWaguriEmbed({ client: member.client }, 'info', {
                title: '🌸・Chào mừng thành viên mới!',
                description:
                    `**Xin chào <@${member.id}>** — tớ là **Waguri Kaoruko**, quản lý tiệm bánh Gekka! 🍰\n\n` +
                    `Tớ rất vui vì cậu đã ghé thăm **${member.guild.name}** đó~ Cậu sẽ thích ở đây mà!\n\n` +
                    `**Bắt đầu nhé:**\n` +
                    `> 📜 Đọc kênh **#nội-quy** để biết cách chơi đúng luật nha.\n` +
                    `> 🌸 Ghé **#hướng-dẫn** để khám phá mọi thứ tớ có thể làm cho cậu.\n` +
                    `> 🎁 Gõ \`/start\` để nhận **quà chào mừng** và bắt đầu hành trình!\n\n` +
                    `*Chúc cậu có những giây phút thật ngọt ngào bên mọi người~* 💕`,
            });

            await channel.send({ embeds: [embed] });
        } catch (error) {
            logError('guildMemberAdd', error, { guild: member.guild.id });
        }
    },
};

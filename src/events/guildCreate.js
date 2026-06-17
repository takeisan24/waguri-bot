const { Events, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const config = require('../config');

module.exports = {
    name: Events.GuildCreate,
    async execute(guild) {
        try {
            const me = guild.members.me;
            const canSend = ch => ch
                && ch.type === ChannelType.GuildText
                && ch.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages);

            // Ưu tiên kênh hệ thống, không thì tìm kênh text đầu tiên gửi được
            let channel = canSend(guild.systemChannel) ? guild.systemChannel : guild.channels.cache.find(canSend);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setColor(config.COLORS.INFO)
                .setTitle('Xin chào, mình là Waguri 🌸')
                .setThumbnail(guild.client.user.displayAvatarURL())
                .setDescription(
                    `Cảm ơn đã mời mình tới **${guild.name}**! Mình là cô bạn AI kiêm "quản gia kinh tế" của server đó~\n\n` +
                    '• 💬 Gõ `/ask` hoặc **@tag mình** để trò chuyện bất cứ điều gì\n' +
                    '• 💼 `/work` kiếm tiền · `/daily` điểm danh · `/shop` mua sắm\n' +
                    '• 🎲 `/coinflip` `/baucua` `/blackjack` chơi cho vui\n' +
                    '• 📜 Gõ `/help` để xem tất cả các lệnh nhé!'
                )
                .setFooter({ text: `Dùng được cả tiền tố ${config.PREFIX} (vd ${config.PREFIX}help) · Cùng nhau vui nhé!` });

            await channel.send({ embeds: [embed] });
            console.log(`[GUILD JOIN] Đã gửi lời chào tới "${guild.name}" (${guild.id})`);
        } catch (error) {
            console.error('[GUILD JOIN] Lỗi gửi lời chào:', error);
        }
    },
};

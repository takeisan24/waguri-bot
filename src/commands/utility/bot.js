const { SlashCommandBuilder, PermissionFlagsBits, OAuth2Scopes } = require('discord.js');
const { buildWaguriEmbed, pickWaguriImage } = require('../../lib/embed');
const config = require('../../config');
const { version } = require('../../../package.json');

function fmtUptime(ms) {
    let s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    return [d && `${d}d`, h && `${h}h`, `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bot')
        .setDescription('Thông tin, trạng thái và lời mời của bot 🤖')
        .addSubcommand(s => s.setName('ping').setDescription('Kiểm tra độ trễ & trạng thái của bot'))
        .addSubcommand(s => s.setName('about').setDescription('Giới thiệu Waguri & thông tin nhà phát triển 🌸'))
        .addSubcommand(s => s.setName('support').setDescription('Nhận trợ giúp & vào server hỗ trợ Waguri 🛟'))
        .addSubcommand(s => s.setName('invite').setDescription('Mời Waguri về server của cậu 🌸')),
    async execute(interaction) {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        const c = interaction.client;

        if (sub === 'ping') {
            const start = Date.now();
            // Lấy thời gian phản hồi bằng hiệu số mốc gửi tin (fake bằng editReply vì đã defer)
            const replyMsg = await interaction.editReply({ content: 'Đang đo độ trễ...' });
            const rtt = Date.now() - start;
            const ws = Math.round(c.ws.ping);

            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '🏓・Pong!',
                fields: [
                    { name: '📡 API (WebSocket)', value: ws < 0 ? 'đang đo...' : `${ws}ms`, inline: true },
                    { name: '⏱️ Phản hồi', value: `${rtt}ms`, inline: true },
                    { name: '⏰ Online', value: fmtUptime(c.uptime), inline: true }
                ]
            });
            embed.setFooter({
                text: `Waguri vẫn đang chạy ngon lành~ • ${embed.data.footer.text}`,
                iconURL: embed.data.footer.icon_url
            });
            await interaction.editReply({ content: '', embeds: [embed] });
        }

        if (sub === 'about') {
            const voteUrl = `https://top.gg/bot/${c.user.id}/vote`;
            const support = process.env.SUPPORT_INVITE;

            const links = [`🗳️ [Vote trên Top.gg](${voteUrl})`, '➕ Mời bot: `/bot invite`'];
            if (support) links.push(`🛟 [Server hỗ trợ](${support})`);

            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '🌸・Về Waguri',
                thumbnail: pickWaguriImage('MAIN'),
                description:
                    'Mình là **Waguri Kaoruko** — cô bạn gái AI kiêm "quản lý tiệm bánh Gekka" 🍰\n' +
                    'Một bot **kinh tế · nhập vai · cộng đồng** bản địa hoá thuần Việt~',
                fields: [
                    { name: '👤 Nhà phát triển', value: `**${config.CREATOR}**`, inline: true },
                    { name: '🔖 Phiên bản', value: `v${version}`, inline: true },
                    { name: '🌐 Đang phục vụ', value: `${c.guilds.cache.size} server`, inline: true },
                    { name: '🔗 Liên kết', value: links.join('\n') },
                ],
            });
            embed.setFooter({
                text: `Cảm ơn cậu đã đồng hành cùng Waguri! • Tạo bởi ${config.CREATOR} 🌸`,
                iconURL: c.user.displayAvatarURL(),
            });
            await interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'support') {
            const inv = process.env.SUPPORT_INVITE;
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '🛟・Hỗ trợ Waguri',
                description: inv
                    ? `Cần giúp đỡ, muốn báo lỗi hay góp ý? Ghé server hỗ trợ của mình nha~ 🌸\n\n[**🛟 Vào server hỗ trợ**](${inv})`
                    : 'Server hỗ trợ đang được cập nhật~ Tạm thời cậu gõ `/help` hoặc liên hệ admin nhé! 🌸',
            });
            await interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'invite') {
            const url = c.generateInvite({
                scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
                permissions: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AddReactions,
                    PermissionFlagsBits.UseExternalEmojis,
                    PermissionFlagsBits.ModerateMembers,
                    PermissionFlagsBits.ManageChannels,
                ],
            });
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '🌸・Mời Waguri về server',
                description: `[**Bấm vào đây để mời mình nha~**](${url})\n\nMình sẽ mang cả nền kinh tế, minigame và những cuộc trò chuyện dễ thương tới server của cậu! 💕`
            });
            embed.setFooter({
                text: `Cảm ơn cậu đã yêu mến Waguri! • ${embed.data.footer.text}`,
                iconURL: embed.data.footer.icon_url
            });
            await interaction.editReply({ embeds: [embed] });
        }
    },
};

const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const { buildWaguriEmbed, pickWaguriImage } = require('../../lib/embed');
const { version } = require('../../../package.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('about')
        .setDescription('Giới thiệu Waguri & thông tin nhà phát triển 🌸'),
    async execute(interaction) {
        await interaction.deferReply();
        const c = interaction.client;
        const voteUrl = `https://top.gg/bot/${c.user.id}/vote`;
        const support = process.env.SUPPORT_INVITE;

        const links = [`🗳️ [Vote trên Top.gg](${voteUrl})`, '➕ Mời bot: `/invite`'];
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
    },
};

const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');

const RELIEF_AMOUNT = 500;
const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cuutro')
        .setDescription('Nhận trợ cấp phá sản từ Waguri khi ví và ngân hàng hết sạch tiền 🌸'),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;

        const result = await db.claimBankruptcyRelief(userId, RELIEF_AMOUNT);

        if (result === 'ok') {
            const embed = buildWaguriEmbed(interaction, 'success', {
                title: '🌸・Cứu trợ phá sản',
                description: `Cậu đã tiêu hết sạch tiền rồi sao? Đừng nản lòng nha, tớ có chút tiền trợ cấp nhỏ này gửi cậu làm vốn nè.\n\n` +
                             `🎁 **Nhận trợ cấp:** **+${fmt(RELIEF_AMOUNT)}** ${config.CURRENCY}!\n` +
                             `*Chúc cậu may mắn hơn ở lần sau nhé, cố gắng lên nào!* 💕`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (result === 'not_bankrupt') {
            const user = await db.getUser(userId);
            const bal = Number(user?.wallet || 0) + Number(user?.bank || 0);
            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: '🌸・Cứu trợ phá sản',
                description: `Hơ, cậu vẫn còn **${fmt(bal)}** ${config.CURRENCY} mà~ Lệnh này chỉ dành cho những bạn thực sự trắng tay thôi nha! 🌸`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (result === 'cooldown') {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: '🌸・Cứu trợ phá sản',
                description: `Cậu đã nhận trợ cấp hôm nay rồi nha~ Quay lại sau 24 tiếng kể từ lần nhận trước nhé! 🌸`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const embedErr = buildWaguriEmbed(interaction, 'error', {
            title: '🌸・Cứu trợ phá sản',
            description: `Ơ, có lỗi xảy ra khi nhận trợ cấp, cậu thử lại sau nhé~`
        });
        return interaction.editReply({ embeds: [embedErr] });
    }
};

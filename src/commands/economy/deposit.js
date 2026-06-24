const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { parseAmount } = require('../../lib/amount');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Gửi tiền từ ví vào ngân hàng')
        .addStringOption(o => o.setName('amount').setDescription('Số tiền hoặc "all"').setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();
        const raw = interaction.options.getString('amount');
        const user = await db.getUser(interaction.user.id);
        if (!user) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🏦・Gửi tiền', description: 'Hơ, mình chưa lấy được dữ liệu của cậu~ 🌸' });
            return interaction.editReply({ embeds: [embed] });
        }

        const amount = parseAmount(raw, Number(user.wallet)); // hỗ trợ 1k/2m/all
        if (!amount || amount <= 0) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🏦・Gửi tiền', description: 'Số tiền không hợp lệ~ (nhập số, `1k`, hoặc `all`)' });
            return interaction.editReply({ embeds: [embed] });
        }

        const ok = await db.transferBank(interaction.user.id, amount, true);
        if (!ok) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🏦・Gửi tiền', description: 'Ví của cậu không đủ để gửi rồi 😟' });
            return interaction.editReply({ embeds: [embed] });
        }

        const u = await db.getUser(interaction.user.id);
        const embedSuccess = buildWaguriEmbed(interaction, 'success', {
            title: '🏦・Gửi tiền thành công',
            description: `Đã gửi **${amount.toLocaleString('vi-VN')}** ${config.CURRENCY} vào ngân hàng. An toàn rồi nhé~ 🌸\n💵 Ví: **${Number(u?.wallet || 0).toLocaleString('vi-VN')}** · 🏦 Ngân hàng: **${Number(u?.bank || 0).toLocaleString('vi-VN')}** ${config.CURRENCY}`
        });
        await interaction.editReply({ embeds: [embedSuccess] });
    },
};

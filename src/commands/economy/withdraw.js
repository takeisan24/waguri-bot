const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('Rút tiền từ ngân hàng về ví')
        .addStringOption(o => o.setName('amount').setDescription('Số tiền hoặc "all"').setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();
        const raw = interaction.options.getString('amount');
        const user = await db.getUser(interaction.user.id);
        if (!user) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🏦・Rút tiền', description: 'Hơ, mình chưa lấy được dữ liệu của cậu~ 🌸' });
            return interaction.editReply({ embeds: [embed] });
        }

        let amount = /^(all|hết|max)$/i.test(raw) ? Number(user.bank) : parseInt(raw, 10);
        if (!Number.isFinite(amount) || amount <= 0) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🏦・Rút tiền', description: 'Số tiền không hợp lệ~ (nhập số hoặc `all`)' });
            return interaction.editReply({ embeds: [embed] });
        }

        const ok = await db.transferBank(interaction.user.id, amount, false);
        if (!ok) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🏦・Rút tiền', description: 'Ngân hàng của cậu không đủ tiền để rút 😟' });
            return interaction.editReply({ embeds: [embed] });
        }

        const u = await db.getUser(interaction.user.id);
        const embedSuccess = buildWaguriEmbed(interaction, 'success', {
            title: '🏦・Rút tiền thành công',
            description: `💵 Đã rút **${amount.toLocaleString('vi-VN')}** ${config.CURRENCY} về ví nhé~ 🌸\n💵 Ví: **${Number(u?.wallet || 0).toLocaleString('vi-VN')}** · 🏦 Ngân hàng: **${Number(u?.bank || 0).toLocaleString('vi-VN')}** ${config.CURRENCY}`
        });
        await interaction.editReply({ embeds: [embedSuccess] });
    },
};

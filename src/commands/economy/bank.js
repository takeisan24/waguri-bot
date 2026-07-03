const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { parseAmount } = require('../../lib/amount');

const fmt = n => Number(n).toLocaleString('vi-VN');

// toBank=true: gửi ví -> ngân hàng; false: rút ngân hàng -> ví. Chuyển nguyên tử qua transferBank.
async function move(interaction, toBank) {
    const raw = interaction.options.getString('amount');
    const title = toBank ? '🏦・Gửi tiền' : '🏦・Rút tiền';
    const user = await db.getUser(interaction.user.id);
    if (!user) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title, description: 'Hơ, mình chưa lấy được dữ liệu của cậu~ 🌸' })] });

    const amount = parseAmount(raw, toBank ? Number(user.wallet) : Number(user.bank)); // hỗ trợ 1k/2m/all
    if (!amount || amount <= 0) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title, description: 'Số tiền không hợp lệ~ (nhập số, `1k`, hoặc `all`)' })] });

    const ok = await db.transferBank(interaction.user.id, amount, toBank);
    if (!ok) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title, description: toBank ? 'Ví của cậu không đủ để gửi rồi 😟' : 'Ngân hàng của cậu không đủ tiền để rút 😟' })] });

    const u = await db.getUser(interaction.user.id);
    const bal = `💵 Ví: **${fmt(u?.wallet || 0)}** · 🏦 Ngân hàng: **${fmt(u?.bank || 0)}** ${config.CURRENCY}`;
    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        title: toBank ? '🏦・Gửi tiền thành công' : '🏦・Rút tiền thành công',
        description: (toBank ? `Đã gửi **${fmt(amount)}** ${config.CURRENCY} vào ngân hàng. An toàn rồi nhé~ 🌸\n` : `💵 Đã rút **${fmt(amount)}** ${config.CURRENCY} về ví nhé~ 🌸\n`) + bal
    })] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bank')
        .setDescription('Ngân hàng 🏦 — gửi / rút tiền (gui · rut)')
        .addSubcommand(s => s.setName('gui').setDescription('Gửi tiền từ ví vào ngân hàng')
            .addStringOption(o => o.setName('amount').setDescription('Số tiền hoặc "all"').setRequired(true)))
        .addSubcommand(s => s.setName('rut').setDescription('Rút tiền từ ngân hàng về ví')
            .addStringOption(o => o.setName('amount').setDescription('Số tiền hoặc "all"').setRequired(true))),
    async execute(interaction) {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        if (sub === 'gui') return move(interaction, true);
        if (sub === 'rut') return move(interaction, false);
        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🏦・Ngân hàng', description: 'Thử `/bank gui` hoặc `/bank rut` nhé~' })] });
    },
};

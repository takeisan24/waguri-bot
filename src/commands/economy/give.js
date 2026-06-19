const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('give')
        .setDescription('Chuyển tiền (trong ví) cho người khác')
        .addUserOption(o => o.setName('target').setDescription('Người nhận').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Số tiền').setRequired(true).setMinValue(1)),
    async execute(interaction) {
        await interaction.deferReply();
        const target = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');

        if (!target) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '💸・Chuyển tiền', description: 'Cậu muốn chuyển cho ai? Nhập @người nhận nhé~ 🌸' });
            return interaction.editReply({ embeds: [embed] });
        }
        if (target.bot) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '💸・Chuyển tiền', description: 'Bot không nhận tiền đâu cậu ơi~ 😄' });
            return interaction.editReply({ embeds: [embed] });
        }
        if (target.id === interaction.user.id) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '💸・Chuyển tiền', description: 'Cậu không thể tự chuyển cho chính mình đâu~ 😄' });
            return interaction.editReply({ embeds: [embed] });
        }
        if (!amount || amount <= 0) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '💸・Chuyển tiền', description: 'Số tiền phải lớn hơn 0 nhé~' });
            return interaction.editReply({ embeds: [embed] });
        }

        const tax = Math.floor(amount * config.GIVE_TAX_PCT);
        const received = amount - tax;

        const ok = await db.transferMoneyWithTax(interaction.user.id, target.id, amount, config.GIVE_TAX_PCT);
        if (!ok) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '💸・Chuyển tiền', description: 'Ví của cậu không đủ tiền rồi 😟. Làm thêm với `/work` nhé!' });
            return interaction.editReply({ embeds: [embed] });
        }

        const me = await db.getUser(interaction.user.id);

        const embed = buildWaguriEmbed(interaction, 'success', {
            title: '💸・Chuyển tiền thành công',
            description: `Cậu đã chuyển cho <@${target.id}>. Tử tế ghê~ 🌸\n` +
                (tax > 0 ? `Thuế ${Math.round(config.GIVE_TAX_PCT * 100)}%: **-${fmt(tax)}** → người nhận thực nhận **${fmt(received)}** ${config.CURRENCY}\n` : `Người nhận được **${fmt(received)}** ${config.CURRENCY}\n`) +
                `💵 Số dư của cậu: **${fmt(me?.wallet || 0)}** ${config.CURRENCY}`
        });
        await interaction.editReply({ embeds: [embed] });
    },
};

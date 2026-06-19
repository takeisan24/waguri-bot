const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { isOwner } = require('../../lib/owner');
const { targetDrawDate, resolveToday } = require('../../lib/xoso');

const fmt = n => Number(n).toLocaleString('vi-VN');
const pad2 = n => String(n).padStart(2, '0');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xoso')
        .setDescription('Đánh đề theo XSMB thật 🎰 — dò 2 số cuối giải đặc biệt lúc 18h30')
        .addSubcommand(s => s.setName('bet').setDescription('Đặt đề (2 số 00-99)')
            .addIntegerOption(o => o.setName('number').setDescription('Số đề (0-99)').setRequired(true).setMinValue(0).setMaxValue(99))
            .addIntegerOption(o => o.setName('amount').setDescription('Tiền cược').setRequired(true).setMinValue(config.XOSO.MIN).setMaxValue(config.XOSO.MAX)))
        .addSubcommand(s => s.setName('mine').setDescription('Xem đề cậu đã đặt cho kỳ tới'))
        .addSubcommand(s => s.setName('result').setDescription('Kết quả các kỳ gần đây'))
        .addSubcommand(s => s.setName('ketqua').setDescription('(Owner) Nhập kết quả XSMB hôm nay để quay')
            .addIntegerOption(o => o.setName('number').setDescription('2 số cuối giải đặc biệt (0-99)').setRequired(true).setMinValue(0).setMaxValue(99))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'bet') {
            await interaction.deferReply();
            const number = interaction.options.getInteger('number');
            const amount = interaction.options.getInteger('amount');
            const date = targetDrawDate();
            const r = await db.xosoBet(interaction.user.id, number, amount, date);
            if (!r) return interaction.editReply('Ơ, có lỗi khi đặt đề, thử lại sau nhé~ 🌸');
            if (r.status === 'poor') return interaction.editReply(`Ví cậu không đủ **${fmt(amount)}** ${config.CURRENCY} để đặt~ 😟`);
            return interaction.editReply(`🎰 Đã đặt đề **${pad2(number)}** với **${fmt(amount)}** ${config.CURRENCY}.\nQuay lúc **18h30** ngày **${date}** (dò giải đặc biệt XSMB). Trúng nhận **x${config.XOSO.PAYOUT}** = **${fmt(amount * config.XOSO.PAYOUT)}** ${config.CURRENCY}! 🤞`);
        }

        if (sub === 'mine') {
            await interaction.deferReply();
            const date = targetDrawDate();
            const bets = await db.xosoMyBets(interaction.user.id, date);
            if (!bets.length) return interaction.editReply(`Cậu chưa đặt đề cho kỳ **${date}**~ Gõ \`/xoso bet\` nhé.`);
            const lines = bets.map(b => `• Đề **${pad2(b.number)}** — **${fmt(b.amount)}** ${config.CURRENCY} *(trúng x${config.XOSO.PAYOUT})*`);
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(config.COLORS.INFO).setTitle(`🎰 Đề của cậu — kỳ ${date}`).setDescription(lines.join('\n'))] });
        }

        if (sub === 'result') {
            await interaction.deferReply();
            const rows = await db.xosoRecentResults(7);
            if (!rows.length) return interaction.editReply('Chưa có kết quả kỳ nào~ 🌸');
            const lines = rows.map(r => `📅 **${r.draw_date}** → giải ĐB 2 số cuối: **${pad2(r.number)}**`);
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(config.COLORS.JACKPOT).setTitle('🎰 Kết quả đề gần đây (XSMB)').setDescription(lines.join('\n'))] });
        }

        if (sub === 'ketqua') {
            if (!await isOwner(interaction.client, interaction.user.id)) {
                return interaction.reply({ content: 'Chỉ owner mới nhập kết quả được nhé~ 🌸', flags: MessageFlags.Ephemeral });
            }
            await interaction.deferReply();
            const number = interaction.options.getInteger('number');
            const r = await resolveToday(interaction.client, number);
            if (!r) return interaction.editReply('Ơ, có lỗi, thử lại sau nhé~');
            if (r.status === 'already') return interaction.editReply('Hôm nay đã có kết quả rồi nhé~');
            return interaction.editReply(`✅ Đã quay với giải ĐB **${pad2(number)}**: ${r.winners}/${r.total} vé trúng, trả thưởng **${fmt(r.paid)}** ${config.CURRENCY}. Đã đăng kết quả vào các kênh.`);
        }
    },
};

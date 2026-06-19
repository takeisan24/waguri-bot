const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
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
            if (!r) {
                const embed = buildWaguriEmbed(interaction, 'error', { title: '🎰・Đặt Đề XSMB', description: 'Ơ, có lỗi khi đặt đề, thử lại sau nhé~ 🌸' });
                return interaction.editReply({ embeds: [embed] });
            }
            if (r.status === 'poor') {
                const embed = buildWaguriEmbed(interaction, 'error', { title: '🎰・Đặt Đề XSMB', description: `Ví cậu không đủ **${fmt(amount)}** ${config.CURRENCY} để đặt~ 😟` });
                return interaction.editReply({ embeds: [embed] });
            }
            const embed = buildWaguriEmbed(interaction, 'success', {
                title: '🎰・Đặt Đề XSMB',
                description: `Đã đặt đề **${pad2(number)}** với **${fmt(amount)}** ${config.CURRENCY}.\nQuay lúc **18h30** ngày **${date}** (dò giải đặc biệt XSMB). Trúng nhận **x${config.XOSO.PAYOUT}** = **${fmt(amount * config.XOSO.PAYOUT)}** ${config.CURRENCY}! 🤞`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'mine') {
            await interaction.deferReply();
            const date = targetDrawDate();
            const bets = await db.xosoMyBets(interaction.user.id, date);
            if (!bets.length) {
                const embed = buildWaguriEmbed(interaction, 'warning', { title: `🎰・Đề Của Cậu — Kỳ ${date}`, description: `Cậu chưa đặt đề cho kỳ **${date}**~ Gõ \`/xoso bet\` nhé.` });
                return interaction.editReply({ embeds: [embed] });
            }
            const lines = bets.map(b => `• Đề **${pad2(b.number)}** — **${fmt(b.amount)}** ${config.CURRENCY} *(trúng x${config.XOSO.PAYOUT})*`);
            const embed = buildWaguriEmbed(interaction, 'info', { title: `🎰・Đề Của Cậu — Kỳ ${date}`, description: lines.join('\n') });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'result') {
            await interaction.deferReply();
            const rows = await db.xosoRecentResults(7);
            if (!rows.length) {
                const embed = buildWaguriEmbed(interaction, 'warning', { title: '🎰・Kết Quả Đề Gần Đây', description: 'Chưa có kết quả kỳ nào~ 🌸' });
                return interaction.editReply({ embeds: [embed] });
            }
            const lines = rows.map(r => `📅 **${r.draw_date}** → giải ĐB 2 số cuối: **${pad2(r.number)}**`);
            const embed = buildWaguriEmbed(interaction, 'jackpot', { title: '🎰・Kết Quả Đề Gần Đây (XSMB)', description: lines.join('\n') });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'ketqua') {
            if (!await isOwner(interaction.client, interaction.user.id)) {
                const embed = buildWaguriEmbed(interaction, 'error', { title: '🎰・Quay Đề XSMB', description: 'Chỉ owner mới nhập kết quả được nhé~ 🌸' });
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            await interaction.deferReply();
            const number = interaction.options.getInteger('number');
            const r = await resolveToday(interaction.client, number);
            if (!r) {
                const embed = buildWaguriEmbed(interaction, 'error', { title: '🎰・Quay Đề XSMB', description: 'Ơ, có lỗi, thử lại sau nhé~' });
                return interaction.editReply({ embeds: [embed] });
            }
            if (r.status === 'already') {
                const embed = buildWaguriEmbed(interaction, 'warning', { title: '🎰・Quay Đề XSMB', description: 'Hôm nay đã có kết quả rồi nhé~' });
                return interaction.editReply({ embeds: [embed] });
            }
            const embed = buildWaguriEmbed(interaction, 'success', {
                title: '🎰・Quay Đề XSMB',
                description: `✅ Đã quay với giải ĐB **${pad2(number)}**: ${r.winners}/${r.total} vé trúng, trả thưởng **${fmt(r.paid)}** ${config.CURRENCY}. Đã đăng kết quả vào các kênh.`
            });
            return interaction.editReply({ embeds: [embed] });
        }
    },
};

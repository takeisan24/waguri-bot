const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { parseAmount } = require('../../lib/amount');
const { checkBet } = require('../../lib/bet');
const { applyPolice } = require('../../lib/police');

const fmt = n => Number(n).toLocaleString('vi-VN');
const SYMBOLS = [
    { id: 'bau', name: 'Bầu', emoji: '🍐' },
    { id: 'cua', name: 'Cua', emoji: '🦀' },
    { id: 'tom', name: 'Tôm', emoji: '🦐' },
    { id: 'ca', name: 'Cá', emoji: '🐟' },
    { id: 'ga', name: 'Gà', emoji: '🐓' },
    { id: 'nai', name: 'Nai', emoji: '🦌' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('baucua')
        .setDescription('Bầu Cua Tôm Cá: đặt 1 con, đổ 3 xúc xắc')
        .addStringOption(o => o.setName('bet').setDescription('Số tiền cược (vd 1000, 1k, all)').setRequired(true))
        .addStringOption(o => o.setName('choice').setDescription('Đặt con nào?').setRequired(true)
            .addChoices(...SYMBOLS.map(s => ({ name: `${s.emoji} ${s.name}`, value: s.id })))),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;
        const user = await db.getUser(userId);
        if (!user) return interaction.editReply('Hơ, lỗi dữ liệu, thử lại sau nhé~ 🌸');

        const bet = parseAmount(interaction.options.getString('bet'), Number(user.wallet));
        const choice = interaction.options.getString('choice');
        const err = checkBet(bet);
        if (err) return interaction.editReply(`🌸 ${err}`);
        if (!await db.addMoney(userId, -bet, 'wallet')) return interaction.editReply('Ví cậu không đủ để cược~ 😟');

        const rolled = [0, 0, 0].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
        const matches = rolled.filter(s => s.id === choice).length;
        const picked = SYMBOLS.find(s => s.id === choice);

        let desc = `🎲 Kết quả: ${rolled.map(s => s.emoji).join(' ')}\n` +
            `Cậu đặt ${picked.emoji} **${picked.name}** — trúng **${matches}** con\n`;
        let win = matches > 0;
        if (win) {
            const payout = bet * (1 + matches);
            await db.addMoney(userId, payout, 'wallet');
            db.questIncr(userId, 'gamble_win', 1);
            desc += `🎉 Thắng **+${fmt(payout - bet)}** ${config.CURRENCY}!`;
        } else {
            desc += `😢 Thua **-${fmt(bet)}** ${config.CURRENCY}. Lần sau nhé~`;
        }
        const fine = await applyPolice(userId);
        if (fine !== null) desc += `\n\n🚨 **Công an ập tới!** Cờ bạc nhiều quá, cậu bị phạt **${fmt(fine)}** ${config.CURRENCY}! 😱`;

        await interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(win ? config.COLORS.SUCCESS : config.COLORS.ERROR)
            .setTitle('🦀 Bầu Cua Tôm Cá').setDescription(desc)] });
    },
};

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { parseAmount } = require('../../lib/amount');
const { checkBet } = require('../../lib/bet');
const { applyPolice } = require('../../lib/police');

const DICE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const fmt = n => Number(n).toLocaleString('vi-VN');
const roll = () => Math.floor(Math.random() * 6) + 1;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('taixiu')
        .setDescription('Tài Xỉu: cược 3 xúc xắc (Tài 11-17, Xỉu 4-10)')
        .addStringOption(o => o.setName('bet').setDescription('Số tiền cược (vd 1000, 1k, all)').setRequired(true))
        .addStringOption(o => o.setName('choice').setDescription('Tài hay Xỉu?').setRequired(true)
            .addChoices({ name: 'Tài (11-17)', value: 'tai' }, { name: 'Xỉu (4-10)', value: 'xiu' })),
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

        const d = [roll(), roll(), roll()];
        const sum = d[0] + d[1] + d[2];
        const triple = d[0] === d[1] && d[1] === d[2];
        const result = sum >= 11 ? 'tai' : 'xiu';
        const win = !triple && result === choice;

        let desc = `🎲 ${DICE[d[0]]} ${DICE[d[1]]} ${DICE[d[2]]} = **${sum}** ${triple ? '(Bão! 💥)' : `(**${result === 'tai' ? 'Tài' : 'Xỉu'}**)`}\n`;
        if (win) {
            const payout = Math.round(bet * config.GAMBLE.TAIXIU_MULT);
            await db.addMoney(userId, payout, 'wallet');
            db.questIncr(userId, 'gamble_win', 1);
            desc += `🎉 Cậu thắng **+${fmt(payout - bet)}** ${config.CURRENCY}!`;
        } else {
            desc += triple
                ? `💥 Ra bão, nhà cái thắng. Cậu mất **-${fmt(bet)}** ${config.CURRENCY}~`
                : `😢 Cậu thua **-${fmt(bet)}** ${config.CURRENCY}. Lần sau nhé~`;
        }
        const fine = await applyPolice(userId);
        if (fine !== null) {
            let jailed = false;
            try { await interaction.member?.timeout?.(config.POLICE.JAIL_MS, 'Cờ bạc bị công an bắt'); jailed = true; } catch { /* bot thiếu quyền timeout */ }
            desc += `\n\n🚨 **Công an ập tới!** Cậu bị phạt **${fmt(fine)}** ${config.CURRENCY}`
                + (jailed ? ` và **tạm giam ${Math.round(config.POLICE.JAIL_MS / 60000)} phút**! 🚓` : '! 😱');
        }

        await interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(win ? config.COLORS.SUCCESS : config.COLORS.ERROR)
            .setTitle('🎲 Tài Xỉu').setDescription(desc)] });
    },
};

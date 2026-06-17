const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { parseAmount } = require('../../lib/amount');
const { checkBet } = require('../../lib/bet');
const { applyPolice } = require('../../lib/police');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Tung đồng xu cược tiền (ngửa/sấp)')
        .addStringOption(o => o.setName('bet').setDescription('Số tiền cược (vd 1000, 1k, all)').setRequired(true))
        .addStringOption(o => o.setName('side').setDescription('Chọn mặt').setRequired(true)
            .addChoices({ name: 'Ngửa', value: 'ngua' }, { name: 'Sấp', value: 'sap' })),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;
        const user = await db.getUser(userId);
        if (!user) return interaction.editReply('Hơ, lỗi dữ liệu, thử lại sau nhé~ 🌸');

        const bet = parseAmount(interaction.options.getString('bet'), Number(user.wallet));
        const side = interaction.options.getString('side');
        const err = checkBet(bet);
        if (err) return interaction.editReply(`🌸 ${err}`);
        if (!await db.addMoney(userId, -bet, 'wallet')) return interaction.editReply('Ví cậu không đủ để cược~ 😟');

        const flip = Math.random() < 0.5 ? 'ngua' : 'sap';
        const win = flip === side;
        let desc = `🪙 Đồng xu rơi xuống mặt **${flip === 'ngua' ? 'Ngửa' : 'Sấp'}**\n`;
        if (win) {
            const payout = Math.round(bet * config.GAMBLE.COINFLIP_MULT);
            await db.addMoney(userId, payout, 'wallet');
            db.questIncr(userId, 'gamble_win', 1);
            desc += `🎉 Cậu thắng **+${fmt(payout - bet)}** ${config.CURRENCY}!`;
        } else {
            desc += `😢 Cậu thua **-${fmt(bet)}** ${config.CURRENCY}. Lần sau may hơn nhé~`;
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
            .setTitle('🪙 Tung Đồng Xu').setDescription(desc)] });
    },
};

const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { parseAmount } = require('../../lib/amount');
const { checkBet } = require('../../lib/bet');
const { applyPolice } = require('../../lib/police');
const { policeJailEnabled } = require('../../lib/guildflags');
const { buildWaguriEmbed } = require('../../lib/embed');

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
        if (!user) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: 'Hơ, lỗi dữ liệu, thử lại sau nhé~ 🌸'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const bet = parseAmount(interaction.options.getString('bet'), Number(user.wallet));
        const side = interaction.options.getString('side');
        const err = await checkBet(bet, interaction.guildId);
        if (err) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: `🌸 ${err}`
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (!await db.addMoney(userId, -bet, 'wallet')) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: 'Ví cậu không đủ để cược~ 😟'
            });
            return interaction.editReply({ embeds: [embed] });
        }

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
        const policeRes = await applyPolice(userId);
        if (policeRes !== null) {
            const { fine, usedIns } = policeRes;
            let jailTime = config.POLICE.JAIL_MS;
            if (usedIns) jailTime = Math.round(jailTime * 0.5); // Giảm 50% thời gian giam giữ
            let jailed = false;
            if (await policeJailEnabled(interaction.guildId)) {
                try { await interaction.member?.timeout?.(jailTime, 'Vi phạm luật trò may rủi'); jailed = true; } catch { /* bot thiếu quyền timeout */ }
            }
            desc += `\n\n🚨 **Công an ập tới!** Cậu bị phạt **${fmt(fine)}** ${config.CURRENCY}`
                + (usedIns ? ` (đã giảm 50% nhờ 🛡️ **Bảo hiểm Đường phố**)` : '')
                + (jailed ? ` và **tạm giam ${Math.round(jailTime / 60000)} phút**! 🚓` : '! 😱');
        }

        const afterBal = await db.getUser(userId);
        desc += `\n💵 Số dư ví: **${fmt(afterBal?.wallet || 0)}** ${config.CURRENCY}`;

        const embed = buildWaguriEmbed(interaction, win ? 'success' : 'error', {
            title: '🪙・Tung Đồng Xu',
            description: desc
        }).setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

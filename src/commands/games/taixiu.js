const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { parseAmount } = require('../../lib/amount');
const { checkBet } = require('../../lib/bet');
const { applyPolice } = require('../../lib/police');
const { policeJailEnabled } = require('../../lib/guildflags');
const { buildWaguriEmbed } = require('../../lib/embed');
const { handleNewbieQuest } = require('../../lib/newbie');

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
        if (!user) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: 'Hơ, lỗi dữ liệu, thử lại sau nhé~ 🌸'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const bet = parseAmount(interaction.options.getString('bet'), Number(user.wallet));
        const choice = interaction.options.getString('choice');
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
            title: '🎲・Tài Xỉu',
            description: desc
        }).setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        await handleNewbieQuest(interaction, 'gamble', 1);
    },
};

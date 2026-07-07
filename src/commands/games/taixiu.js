const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { parseAmount } = require('../../lib/amount');
const { checkBet } = require('../../lib/bet');
const { applyPolice } = require('../../lib/police');
const { policeJailEnabled } = require('../../lib/guildflags');
const { buildWaguriEmbed } = require('../../lib/embed');
const { handleNewbieQuest } = require('../../lib/newbie');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const DICE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
const roll = () => Math.floor(Math.random() * 6) + 1;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('taixiu')
        .setDescription('Tài Xỉu: cược 3 xúc xắc (Tài 11-17, Xỉu 4-10)')
        .addStringOption(o => o.setName('bet').setDescription('Số tiền cược (vd 1000, 1k, all)').setRequired(true))
        .addStringOption(o => o.setName('choice').setDescription('Tài hay Xỉu?').setRequired(true)
            .addChoices({ name: 'Tài (11-17) / Big (11-17)', value: 'tai' }, { name: 'Xỉu (4-10) / Small (4-10)', value: 'xiu' })),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        const user = await db.getUser(userId);
        if (!user) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'common.db_error')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const bet = parseAmount(interaction.options.getString('bet'), Number(user.wallet));
        const choice = interaction.options.getString('choice');
        const err = await checkBet(bet, interaction.guildId);
        if (err) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                description: `🌸 ${err}`
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (!await db.addMoney(userId, -bet, 'wallet')) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                description: t(locale, 'common.insufficient_funds', { cost: fmt(bet, locale), currency: config.CURRENCY })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const d = [roll(), roll(), roll()];
        const sum = d[0] + d[1] + d[2];
        const triple = d[0] === d[1] && d[1] === d[2];
        const result = sum >= 11 ? 'tai' : 'xiu';
        const win = !triple && result === choice;

        const typeStr = triple
            ? t(locale, 'commands.taixiu.result_bao')
            : `(**${result === 'tai' ? t(locale, 'commands.taixiu.result_tai') : t(locale, 'commands.taixiu.result_xiu')}**)`;

        let desc = t(locale, 'commands.taixiu.dice_rolled', {
            dices: `${DICE[d[0]]} ${DICE[d[1]]} ${DICE[d[2]]}`,
            sum,
            type: typeStr
        });

        if (win) {
            const payout = Math.round(bet * config.GAMBLE.TAIXIU_MULT);
            await db.addMoney(userId, payout, 'wallet');
            db.questIncr(userId, 'gamble_win', 1);
            desc += t(locale, 'commands.taixiu.win_msg', { winAmount: fmt(payout - bet, locale), currency: config.CURRENCY });
        } else {
            desc += triple
                ? t(locale, 'commands.taixiu.lose_bao_msg', { loseAmount: fmt(bet, locale), currency: config.CURRENCY })
                : t(locale, 'commands.taixiu.lose_msg', { loseAmount: fmt(bet, locale), currency: config.CURRENCY });
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
            desc += t(locale, 'commands.taixiu.police_arrival', { fine: fmt(fine, locale), currency: config.CURRENCY })
                + (usedIns ? t(locale, 'commands.taixiu.police_ins') : '')
                + (jailed ? t(locale, 'commands.taixiu.police_jailed', { jailMinutes: Math.round(jailTime / 60000) }) : t(locale, 'commands.taixiu.police_fine_only'));
        }

        const afterBal = await db.getUser(userId);
        desc += t(locale, 'commands.taixiu.balance_footer', { balance: fmt(afterBal?.wallet || 0, locale), currency: config.CURRENCY });

        const embed = buildWaguriEmbed(interaction, win ? 'success' : 'error', {
            locale,
            title: t(locale, 'commands.taixiu.title'),
            description: desc
        }).setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        await handleNewbieQuest(interaction, 'gamble', 1);
    },
};

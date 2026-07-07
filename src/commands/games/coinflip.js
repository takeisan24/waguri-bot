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

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Tung đồng xu cược tiền (ngửa/sấp)')
        .addStringOption(o => o.setName('bet').setDescription('Số tiền cược (vd 1000, 1k, all)').setRequired(true))
        .addStringOption(o => o.setName('side').setDescription('Chọn mặt').setRequired(true)
            .addChoices({ name: 'Ngửa / Heads', value: 'ngua' }, { name: 'Sấp / Tails', value: 'sap' })),
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
        const side = interaction.options.getString('side');
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

        const flip = Math.random() < 0.5 ? 'ngua' : 'sap';
        const win = flip === side;
        const flipName = flip === 'ngua' ? t(locale, 'commands.coinflip.result_ngua') : t(locale, 'commands.coinflip.result_sap');
        let desc = t(locale, 'commands.coinflip.coin_dropped', { flip: flipName });
        if (win) {
            const payout = Math.round(bet * config.GAMBLE.COINFLIP_MULT);
            await db.addMoney(userId, payout, 'wallet');
            db.questIncr(userId, 'gamble_win', 1);
            desc += t(locale, 'commands.coinflip.win_msg', { winAmount: fmt(payout - bet, locale), currency: config.CURRENCY });
        } else {
            desc += t(locale, 'commands.coinflip.lose_msg', { loseAmount: fmt(bet, locale), currency: config.CURRENCY });
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
            desc += t(locale, 'commands.coinflip.police_arrival', { fine: fmt(fine, locale), currency: config.CURRENCY })
                + (usedIns ? t(locale, 'commands.coinflip.police_ins') : '')
                + (jailed ? t(locale, 'commands.coinflip.police_jailed', { jailMinutes: Math.round(jailTime / 60000) }) : t(locale, 'commands.coinflip.police_fine_only'));
        }

        const afterBal = await db.getUser(userId);
        desc += t(locale, 'commands.coinflip.balance_footer', { balance: fmt(afterBal?.wallet || 0, locale), currency: config.CURRENCY });

        const embed = buildWaguriEmbed(interaction, win ? 'success' : 'error', {
            locale,
            title: t(locale, 'commands.coinflip.title'),
            description: desc
        }).setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        await handleNewbieQuest(interaction, 'gamble', 1);
    },
};

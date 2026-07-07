const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { parseAmount } = require('../../lib/amount');
const { checkBet } = require('../../lib/bet');
const { applyPolice } = require('../../lib/police');
const { policeJailEnabled } = require('../../lib/guildflags');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
const SYMBOLS = [
    { id: 'bau', emoji: '🍐' },
    { id: 'cua', emoji: '🦀' },
    { id: 'ca', emoji: '🐟' },
    { id: 'tom', emoji: '🦐' },
    { id: 'ga', emoji: '🐓' },
    { id: 'nai', emoji: '🦌' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('baucua')
        .setDescription('Bầu Cua Tôm Cá: đặt 1 con, đổ 3 xúc xắc')
        .addStringOption(o => o.setName('bet').setDescription('Số tiền cược (vd 1000, 1k, all)').setRequired(true))
        .addStringOption(o => o.setName('choice').setDescription('Đặt con nào?').setRequired(true)
            .addChoices(
                { name: '🍐 Bầu / Gourd', value: 'bau' },
                { name: '🦀 Cua / Crab', value: 'cua' },
                { name: '🐟 Cá / Fish', value: 'ca' },
                { name: '🦐 Tôm / Shrimp', value: 'tom' },
                { name: '🐓 Gà / Rooster', value: 'ga' },
                { name: '🦌 Nai / Deer', value: 'nai' }
            )),
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

        const rolled = [0, 0, 0].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
        const matches = rolled.filter(s => s.id === choice).length;
        const picked = SYMBOLS.find(s => s.id === choice);
        const pickedName = t(locale, `commands.baucua.symbols.${choice}`);

        let desc = t(locale, 'commands.baucua.rolled_result', {
            dices: rolled.map(s => s.emoji).join(' '),
            emoji: picked.emoji,
            name: pickedName,
            matches
        });

        let win = matches > 0;
        if (win) {
            const payout = bet * (1 + matches);
            await db.addMoney(userId, payout, 'wallet');
            db.questIncr(userId, 'gamble_win', 1);
            desc += t(locale, 'commands.baucua.win_msg', { winAmount: fmt(payout - bet, locale), currency: config.CURRENCY });
        } else {
            desc += t(locale, 'commands.baucua.lose_msg', { loseAmount: fmt(bet, locale), currency: config.CURRENCY });
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
            desc += t(locale, 'commands.baucua.police_arrival', { fine: fmt(fine, locale), currency: config.CURRENCY })
                + (usedIns ? t(locale, 'commands.baucua.police_ins') : '')
                + (jailed ? t(locale, 'commands.baucua.police_jailed', { jailMinutes: Math.round(jailTime / 60000) }) : t(locale, 'commands.baucua.police_fine_only'));
        }

        const afterBal = await db.getUser(userId);
        desc += t(locale, 'commands.baucua.balance_footer', { balance: fmt(afterBal?.wallet || 0, locale), currency: config.CURRENCY });

        const embed = buildWaguriEmbed(interaction, win ? 'success' : 'error', {
            locale,
            title: t(locale, 'commands.baucua.title'),
            description: desc
        }).setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

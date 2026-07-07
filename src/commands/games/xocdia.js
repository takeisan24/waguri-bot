const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { checkBet } = require('../../lib/bet');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
const MULT = config.GAMBLE.COINFLIP_MULT; // chẵn/lẻ ~50/50 như tung xu
const WINDOW_MS = 30000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xocdia')
        .setDescription('Xóc Đĩa 🥢 — nhiều người đặt Chẵn/Lẻ cùng lúc, 1 lần xóc')
        .addIntegerOption(o => o.setName('bet').setDescription('Mức cược (mọi người cược bằng nhau)').setRequired(true).setMinValue(config.GAMBLE.MIN_BET)),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const sessionId = require('crypto').randomUUID();
        const bet = interaction.options.getInteger('bet');
        const err = await checkBet(bet, interaction.guildId);
        if (err) {
            const embed = buildWaguriEmbed(interaction, 'warning', { locale, description: `🌸 ${err}` });
            return interaction.reply({ embeds: [embed] });
        }

        const bets = new Map(); // userId -> { side, username }
        const counts = () => {
            const chan = [...bets.values()].filter(b => b.side === 'chan').length;
            const le = [...bets.values()].filter(b => b.side === 'le').length;
            return { chan, le };
        };
        const render = () => {
            const c = counts();
            return buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.xocdia.title'),
                description: t(locale, 'commands.xocdia.desc_lobby', {
                    bet: fmt(bet, locale),
                    currency: config.CURRENCY,
                    mult: MULT,
                    chan: c.chan,
                    le: c.le,
                    seconds: WINDOW_MS / 1000
                })
            });
        };
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('chan').setLabel(t(locale, 'commands.xocdia.btn_chan')).setStyle(ButtonStyle.Danger).setEmoji('🔴'),
            new ButtonBuilder().setCustomId('le').setLabel(t(locale, 'commands.xocdia.btn_le')).setStyle(ButtonStyle.Secondary).setEmoji('⚪'),
        );

        await interaction.reply({ embeds: [render()], components: [row] });
        const msg = await interaction.fetchReply();
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: WINDOW_MS });

        collector.on('collect', async (i) => {
            const choiceName = bets.get(i.user.id)?.side === 'chan' ? t(locale, 'commands.xocdia.btn_chan') : t(locale, 'commands.xocdia.btn_le');
            if (bets.has(i.user.id)) return i.reply({ content: t(locale, 'commands.xocdia.already_bet', { side: choiceName }), flags: MessageFlags.Ephemeral });
            if (!await db.stakeCollect(sessionId, 'xocdia', interaction.channelId, i.user.id, bet)) return i.reply({ content: t(locale, 'commands.xocdia.err_insufficient_funds', { bet: fmt(bet, locale), currency: config.CURRENCY }), flags: MessageFlags.Ephemeral });
            bets.set(i.user.id, { side: i.customId, username: i.user.username });
            const btnName = i.customId === 'chan' ? `${t(locale, 'commands.xocdia.btn_chan')} 🔴` : `${t(locale, 'commands.xocdia.btn_le')} ⚪`;
            await i.reply({ content: t(locale, 'commands.xocdia.bet_success', { side: btnName, bet: fmt(bet, locale), currency: config.CURRENCY }), flags: MessageFlags.Ephemeral });
            await interaction.editReply({ embeds: [render()], components: [row] }).catch(() => {});
        });

        collector.on('end', async () => {
            if (bets.size === 0) {
                await db.stakeSettle(sessionId);
                return interaction.editReply({ embeds: [render().setColor(config.COLORS.WARNING).setTitle(t(locale, 'commands.xocdia.err_no_bets_title'))], components: [] }).catch(() => {});
            }
            const coins = [0, 0, 0, 0].map(() => Math.random() < 0.5 ? 1 : 0); // 1 = đỏ
            const reds = coins.reduce((s, c) => s + c, 0);
            const result = reds % 2 === 0 ? 'chan' : 'le';
            const faces = coins.map(c => c ? '🔴' : '⚪').join(' ');

            const wins = [], loses = [];
            for (const [id, b] of bets) {
                if (b.side === result) { const payout = Math.round(bet * MULT); await db.addMoney(id, payout, 'wallet'); db.questIncr(id, 'gamble_win', 1); wins.push(`<@${id}> (+${fmt(payout - bet, locale)})`); }
                else loses.push(`<@${id}> (-${fmt(bet, locale)})`);
            }
            await db.stakeSettle(sessionId);
            const sideResultName = result === 'chan' ? t(locale, 'commands.xocdia.side_chan') : t(locale, 'commands.xocdia.side_le');
            const embedResult = buildWaguriEmbed(interaction, 'jackpot', {
                locale,
                title: t(locale, 'commands.xocdia.result_title'),
                description: t(locale, 'commands.xocdia.result_desc', {
                    faces,
                    reds,
                    side: sideResultName,
                    wins: wins.join(', ') || t(locale, 'commands.xocdia.no_one'),
                    loses: loses.join(', ') || t(locale, 'commands.xocdia.no_one')
                })
            });
            await interaction.editReply({ embeds: [embedResult], components: [] }).catch(() => {});
        });
    },
};

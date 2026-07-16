const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { checkBet } = require('../../lib/bet');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HORSES = [
    { n: 1, c: '🟥' }, { n: 2, c: '🟦' }, { n: 3, c: '🟩' }, { n: 4, c: '🟨' }, { n: 5, c: '🟪' },
];
const FINISH = 12;
const WINDOW_MS = 30000;
const WIN_MULT = Math.round(HORSES.length * (1 - config.PARTY.HOUSE_CUT) * 100) / 100; // ~4.75x

module.exports = {
    data: new SlashCommandBuilder()
        .setName('duangua')
        .setDescription('Đua ngựa 🐎 — đặt cửa 1 con, thắng nhận x' + WIN_MULT)
        .addIntegerOption(o => o.setName('bet').setDescription('Mức cược (mọi người cược bằng nhau)').setRequired(true).setMinValue(config.GAMBLE.MIN_BET)),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const sessionId = require('crypto').randomUUID();
        const bet = interaction.options.getInteger('bet');
        const err = await checkBet(bet, interaction.guildId);
        if (err) {
            const embed = buildWaguriEmbed(interaction, 'warning', { locale, description: `🌸 ${err}` });
            return interaction.editReply({ embeds: [embed] });
        }

        const bets = new Map(); // userId -> { horse, username }
        const render = () => {
            const counts = HORSES.map((h, i) => {
                const horseName = t(locale, 'commands.duangua.horse_name', { n: h.n });
                return `${h.c} **${horseName}**: ${[...bets.values()].filter(b => b.horse === i).length} ${locale === 'en' ? 'players' : 'người'}`;
            }).join('\n');
            return buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.duangua.title'),
                description: t(locale, 'commands.duangua.desc_lobby', {
                    bet: fmt(bet, locale),
                    currency: config.CURRENCY,
                    mult: WIN_MULT,
                    counts,
                    seconds: WINDOW_MS / 1000
                })
            });
        };
        const row = new ActionRowBuilder().addComponents(
            HORSES.map(h => new ButtonBuilder().setCustomId(`h${h.n}`).setLabel(t(locale, 'commands.duangua.horse_name', { n: h.n })).setEmoji(h.c).setStyle(ButtonStyle.Secondary)));

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ embeds: [render()], components: [row] });
        } else {
            await interaction.reply({ embeds: [render()], components: [row] });
        }
        const msg = await interaction.fetchReply();
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: WINDOW_MS });

        collector.on('collect', async (i) => {
            const hName = t(locale, 'commands.duangua.horse_name', { n: bets.get(i.user.id)?.horse + 1 });
            if (bets.has(i.user.id)) return i.reply({ content: t(locale, 'commands.duangua.already_bet', { horse: hName }), flags: MessageFlags.Ephemeral });
            const horse = Number(i.customId.slice(1)) - 1;
            // GIỮ CHỖ đồng bộ TRƯỚC await -> chặn double-click thu cược 2 lần (race). Nhả chỗ nếu thu tiền lỗi.
            bets.set(i.user.id, { horse, username: i.user.username });
            if (!await db.stakeCollect(sessionId, 'duangua', interaction.channelId, i.user.id, bet)) {
                bets.delete(i.user.id);
                return i.reply({ content: t(locale, 'commands.duangua.err_insufficient_funds', { bet: fmt(bet, locale), currency: config.CURRENCY }), flags: MessageFlags.Ephemeral });
            }
            const horseChosenName = t(locale, 'commands.duangua.horse_name', { n: horse + 1 });
            await i.reply({ content: t(locale, 'commands.duangua.bet_success', { horse: horseChosenName, emoji: HORSES[horse].c, bet: fmt(bet, locale), currency: config.CURRENCY }), flags: MessageFlags.Ephemeral });
            await interaction.editReply({ embeds: [render()], components: [row] }).catch(() => {});
        });

        collector.on('end', async () => {
            if (bets.size === 0) {
                await db.stakeSettle(sessionId);
                return interaction.editReply({ embeds: [render().setColor(config.COLORS.WARNING).setTitle(t(locale, 'commands.duangua.err_no_bets_title'))], components: [] }).catch(() => {});
            }
            const pos = HORSES.map(() => 0);
            const lanes = () => HORSES.map((h, i) => `${h.c}\`${'─'.repeat(Math.min(pos[i], FINISH))}🐎${'─'.repeat(Math.max(0, FINISH - pos[i]))}\`🏁`).join('\n');
            // footer cố định khi đang đua (tránh quote đổi mỗi frame gây nhấp nháy)
            const raceEmbed = (title) => buildWaguriEmbed(interaction, 'jackpot', {
                locale,
                title: title,
                description: lanes()
            }).setFooter({ text: t(locale, 'commands.duangua.footer') });

            await interaction.editReply({ embeds: [raceEmbed(t(locale, 'commands.duangua.race_started'))], components: [] }).catch(() => {});
            let winner = null;
            while (winner === null) {
                await sleep(1500);
                for (let i = 0; i < HORSES.length; i++) pos[i] += Math.floor(Math.random() * 3) + 1;
                const done = pos.map((p, i) => ({ p, i })).filter(x => x.p >= FINISH);
                if (done.length) {
                    const max = Math.max(...done.map(x => x.p));
                    const tied = done.filter(x => x.p === max);
                    winner = tied[Math.floor(Math.random() * tied.length)].i;
                }
                await interaction.editReply({ embeds: [raceEmbed(winner === null ? t(locale, 'commands.duangua.race_running') : t(locale, 'commands.duangua.race_finished'))].concat([]) }).catch(() => {});
            }

            const wins = [], loses = [];
            for (const [id, b] of bets) {
                if (b.horse === winner) { const payout = Math.round(bet * WIN_MULT); await db.addMoney(id, payout, 'wallet'); db.questIncr(id, 'gamble_win', 1); wins.push(`<@${id}> (+${fmt(payout - bet, locale)})`); }
                else loses.push(`<@${id}>`);
            }
            await db.stakeSettle(sessionId);
            const winHorseName = t(locale, 'commands.duangua.horse_name', { n: winner + 1 });
            const winEmbed = buildWaguriEmbed(interaction, 'jackpot', {
                locale,
                title: t(locale, 'commands.duangua.win_title', { horse: winHorseName, emoji: HORSES[winner].c }),
                description: t(locale, 'commands.duangua.win_desc', {
                    wins: wins.join(', ') || t(locale, 'commands.duangua.no_one'),
                    loses: loses.join(', ') || t(locale, 'commands.duangua.no_one')
                })
            });
            await interaction.followUp({ embeds: [winEmbed] }).catch(() => {});
        });
    },
};

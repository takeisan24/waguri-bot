const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { parseAmount } = require('../../lib/amount');
const { checkBet } = require('../../lib/bet');
const { applyPolice } = require('../../lib/police');
const { policeJailEnabled } = require('../../lib/guildflags');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function makeDeck() {
    const deck = [];
    for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}
function handValue(cards) {
    let sum = 0, aces = 0;
    for (const c of cards) {
        if (c.r === 'A') { aces++; sum += 11; }
        else if (['J', 'Q', 'K'].includes(c.r)) sum += 10;
        else sum += Number(c.r);
    }
    while (sum > 21 && aces > 0) { sum -= 10; aces--; }
    return sum;
}
const render = cards => cards.map(c => `${c.r}${c.s}`).join(' ');
// Bài tổng 17 "mềm" (còn 1 Át tính 11) -> nhà cái vẫn rút (luật H17), thêm nhẹ lợi thế nhà cái.
function isSoft17(cards) {
    let sum = 0, aces = 0;
    for (const c of cards) {
        if (c.r === 'A') { aces++; sum += 11; }
        else if (['J', 'Q', 'K'].includes(c.r)) sum += 10;
        else sum += Number(c.r);
    }
    while (sum > 21 && aces > 0) { sum -= 10; aces--; }
    return sum === 17 && aces > 0;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Chơi Blackjack (Xì Dách) với nhà cái Waguri 🃏')
        .addStringOption(o => o.setName('bet').setDescription('Số tiền cược (vd 1000, 1k, all)').setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        const user = await db.getUser(userId);
        if (!user) {
            const embedObj = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'common.db_error')
            });
            return interaction.editReply({ embeds: [embedObj] });
        }

        const bet = parseAmount(interaction.options.getString('bet'), Number(user.wallet));
        const err = await checkBet(bet, interaction.guildId);
        if (err) {
            const embedObj = buildWaguriEmbed(interaction, 'warning', {
                locale,
                description: `🌸 ${err}`
            });
            return interaction.editReply({ embeds: [embedObj] });
        }
        if (!await db.addMoney(userId, -bet, 'wallet')) {
            const embedObj = buildWaguriEmbed(interaction, 'warning', {
                locale,
                description: t(locale, 'common.insufficient_funds', { cost: fmt(bet, locale), currency: config.CURRENCY })
            });
            return interaction.editReply({ embeds: [embedObj] });
        }

        const deck = makeDeck();
        const player = [deck.pop(), deck.pop()];
        const dealer = [deck.pop(), deck.pop()];
        let settled = false;

        const embed = (reveal, note, type = 'info') => buildWaguriEmbed(interaction, type, {
            locale,
            title: t(locale, 'commands.blackjack.title'),
            description: note ?? t(locale, 'commands.blackjack.bet_amount', { bet: fmt(bet, locale), currency: config.CURRENCY }),
            fields: [
                { name: t(locale, 'commands.blackjack.your_hand', { value: handValue(player) }), value: render(player), inline: false },
                { name: reveal ? t(locale, 'commands.blackjack.dealer_hand_show', { value: handValue(dealer) }) : t(locale, 'commands.blackjack.dealer_hand_hide'), value: reveal ? render(dealer) : `${dealer[0].r}${dealer[0].s} 🂠`, inline: false },
            ]
        });

        const settle = async (outcome) => {
            if (settled) return;
            settled = true;
            const payout = { win: bet * 2, blackjack: Math.floor(bet * 2.5), push: bet, lose: 0 }[outcome];
            if (payout > 0) {
                if (!await db.addMoney(userId, payout, 'wallet')) console.error(`[PAYOUT FAIL] blackjack user=${userId} payout=${payout}`);
            }
            if (outcome === 'win' || outcome === 'blackjack') db.questIncr(userId, 'gamble_win', 1);
            const net = payout - bet;
            let note = {
                blackjack: t(locale, 'commands.blackjack.blackjack_msg', { winAmount: fmt(net, locale), currency: config.CURRENCY }),
                win: t(locale, 'commands.blackjack.win_msg', { winAmount: fmt(net, locale), currency: config.CURRENCY }),
                push: t(locale, 'commands.blackjack.push_msg'),
                lose: t(locale, 'commands.blackjack.lose_msg', { loseAmount: fmt(bet, locale), currency: config.CURRENCY }),
            }[outcome];
            
            const policeRes = await applyPolice(userId);
            if (policeRes !== null) {
                const { fine, usedIns } = policeRes;
                let jailTime = config.POLICE.JAIL_MS;
                if (usedIns) jailTime = Math.round(jailTime * 0.5); // Giảm 50% thời gian giam giữ
                let jailed = false;
                if (await policeJailEnabled(interaction.guildId)) {
                    try { await interaction.member?.timeout?.(jailTime, 'Vi phạm luật trò may rủi'); jailed = true; } catch { /* bot thiếu quyền timeout */ }
                }
                note += t(locale, 'commands.blackjack.police_arrival', { fine: fmt(fine, locale), currency: config.CURRENCY })
                    + (usedIns ? t(locale, 'commands.blackjack.police_ins') : '')
                    + (jailed ? t(locale, 'commands.blackjack.police_jailed', { jailMinutes: Math.round(jailTime / 60000) }) : t(locale, 'commands.blackjack.police_fine_only'));
            }

            const u = await db.getUser(userId);
            const noteFull = `${note}\n${t(locale, 'commands.blackjack.balance_footer', { balance: fmt(u?.wallet || 0, locale), currency: config.CURRENCY })}`;
            const type = policeRes !== null ? 'error' : (net > 0 ? (outcome === 'blackjack' ? 'jackpot' : 'success') : (net === 0 ? 'warning' : 'error'));
            return embed(true, noteFull, type);
        };

        // Xì dách ngay từ 2 lá
        const pBJ = handValue(player) === 21, dBJ = handValue(dealer) === 21;
        if (pBJ || dBJ) {
            const out = pBJ && dBJ ? 'push' : (pBJ ? 'blackjack' : 'lose');
            return interaction.editReply({ embeds: [await settle(out)], components: [] });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('hit').setLabel(t(locale, 'commands.blackjack.btn_hit')).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('stand').setLabel(t(locale, 'commands.blackjack.btn_stand')).setStyle(ButtonStyle.Secondary),
        );
        const msg = await interaction.editReply({ embeds: [embed(false)], components: [row] });

        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button, time: 60_000,
            filter: i => i.user.id === userId,
        });

        const dealerPlay = () => { while (handValue(dealer) < 17 || isSoft17(dealer)) dealer.push(deck.pop()); };
        const resolve = () => {
            const pv = handValue(player), dv = handValue(dealer);
            if (pv > 21) return 'lose';
            if (dv > 21 || pv > dv) return 'win';
            if (pv < dv) return 'lose';
            return 'push';
        };

        collector.on('collect', async (i) => {
            if (settled) return i.deferUpdate().catch(() => {}); // ván đã kết thúc -> nuốt click thừa (chống double-hit -> embeds:[undefined])
            if (i.customId === 'hit') {
                player.push(deck.pop());
                if (handValue(player) > 21) {
                    const e = await settle('lose');
                    await i.update({ embeds: [e], components: [] });
                    collector.stop('done');
                } else {
                    await i.update({ embeds: [embed(false)], components: [row] });
                }
            } else if (i.customId === 'stand') {
                dealerPlay();
                const e = await settle(resolve());
                await i.update({ embeds: [e], components: [] });
                collector.stop('done');
            }
        });

        collector.on('end', async (_c, reason) => {
            if (settled) return;
            // Hết giờ: tự động dằn (stand)
            dealerPlay();
            const e = await settle(resolve());
            await interaction.editReply({ embeds: [e], components: [] }).catch(() => {});
        });
    },
};

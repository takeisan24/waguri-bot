const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { parseAmount } = require('../../lib/amount');
const { checkBet } = require('../../lib/bet');

const fmt = n => Number(n).toLocaleString('vi-VN');
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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Xì dách (Blackjack) — cược tiền với nhà cái')
        .addStringOption(o => o.setName('bet').setDescription('Số tiền cược (vd 1000, 1k, all)').setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;
        const user = await db.getUser(userId);
        if (!user) return interaction.editReply('Hơ, lỗi dữ liệu, thử lại sau nhé~ 🌸');

        const bet = parseAmount(interaction.options.getString('bet'), Number(user.wallet));
        const err = checkBet(bet);
        if (err) return interaction.editReply(`🌸 ${err}`);
        if (!await db.addMoney(userId, -bet, 'wallet')) return interaction.editReply('Ví cậu không đủ để cược~ 😟');

        const deck = makeDeck();
        const player = [deck.pop(), deck.pop()];
        const dealer = [deck.pop(), deck.pop()];
        let settled = false;

        const embed = (reveal, note, color) => new EmbedBuilder()
            .setColor(color ?? config.COLORS.INFO)
            .setTitle('🃏 Xì Dách (Blackjack)')
            .addFields(
                { name: `Bài của cậu (${handValue(player)})`, value: render(player), inline: false },
                { name: reveal ? `Nhà cái (${handValue(dealer)})` : 'Nhà cái', value: reveal ? render(dealer) : `${dealer[0].r}${dealer[0].s} 🂠`, inline: false },
            )
            .setDescription(note ?? `Cược: **${fmt(bet)}** ${config.CURRENCY}`);

        const settle = async (outcome) => {
            if (settled) return;
            settled = true;
            const payout = { win: bet * 2, blackjack: Math.floor(bet * 2.5), push: bet, lose: 0 }[outcome];
            if (payout > 0) await db.addMoney(userId, payout, 'wallet');
            if (outcome === 'win' || outcome === 'blackjack') db.questIncr(userId, 'gamble_win', 1);
            const net = payout - bet;
            const note = {
                blackjack: `🎉 XÌ DÁCH! Cậu thắng **+${fmt(net)}** ${config.CURRENCY}!`,
                win: `🎉 Cậu thắng **+${fmt(net)}** ${config.CURRENCY}!`,
                push: `🤝 Hòa! Hoàn lại tiền cược.`,
                lose: `😢 Cậu thua **-${fmt(bet)}** ${config.CURRENCY}. Lần sau nhé~`,
            }[outcome];
            const u = await db.getUser(userId);
            const noteFull = `${note}\n💵 Số dư ví: **${fmt(u?.wallet || 0)}** ${config.CURRENCY}`;
            const color = net > 0 ? config.COLORS.SUCCESS : (net === 0 ? config.COLORS.WARNING : config.COLORS.ERROR);
            return embed(true, noteFull, color);
        };

        // Xì dách ngay từ 2 lá
        const pBJ = handValue(player) === 21, dBJ = handValue(dealer) === 21;
        if (pBJ || dBJ) {
            const out = pBJ && dBJ ? 'push' : (pBJ ? 'blackjack' : 'lose');
            return interaction.editReply({ embeds: [await settle(out)], components: [] });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('hit').setLabel('Rút (Hit)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('stand').setLabel('Dằn (Stand)').setStyle(ButtonStyle.Secondary),
        );
        const msg = await interaction.editReply({ embeds: [embed(false)], components: [row] });

        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button, time: 60_000,
            filter: i => i.user.id === userId,
        });

        const dealerPlay = () => { while (handValue(dealer) < 17) dealer.push(deck.pop()); };
        const resolve = () => {
            const pv = handValue(player), dv = handValue(dealer);
            if (pv > 21) return 'lose';
            if (dv > 21 || pv > dv) return 'win';
            if (pv < dv) return 'lose';
            return 'push';
        };

        collector.on('collect', async (i) => {
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

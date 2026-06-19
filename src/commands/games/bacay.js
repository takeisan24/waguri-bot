const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { openLobby } = require('../../lib/lobby');
const { checkBet } = require('../../lib/bet');

const fmt = n => Number(n).toLocaleString('vi-VN');
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

function makeDeck() {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
}
const cardValue = r => (r === 'A' ? 1 : ['10', 'J', 'Q', 'K'].includes(r) ? 10 : Number(r));
const rankIdx = r => RANKS.indexOf(r);
const showCards = cards => cards.map(c => `${c.r}${c.s}`).join(' ');

// Đánh giá bộ 3 lá -> {key:[...], label}. So sánh theo key (lexicographic, lớn hơn = mạnh hơn).
function evaluate(cards) {
    const diem = cards.reduce((s, c) => s + cardValue(c.r), 0) % 10;
    const sameRank = cards[0].r === cards[1].r && cards[1].r === cards[2].r;
    const allFace = cards.every(c => ['J', 'Q', 'K'].includes(c.r));
    const high = Math.max(...cards.map(c => rankIdx(c.r)));
    if (sameRank) return { key: [3, rankIdx(cards[0].r)], label: `Ba cào ${cards[0].r}` };
    if (allFace) return { key: [2, high], label: 'Ba tây (J/Q/K)' };
    return { key: [1, diem, high], label: `${diem} điểm` };
}
function cmp(a, b) {
    const len = Math.max(a.key.length, b.key.length);
    for (let i = 0; i < len; i++) { const d = (a.key[i] || 0) - (b.key[i] || 0); if (d) return d; }
    return 0;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bacay')
        .setDescription('Ba Cây 🃏 — nhiều người, đặt cược bằng nhau, điểm cao ăn cả')
        .addIntegerOption(o => o.setName('bet').setDescription('Tiền cược mỗi người').setRequired(true).setMinValue(config.GAMBLE.MIN_BET)),
    async execute(interaction) {
        const bet = interaction.options.getInteger('bet');
        const err = checkBet(bet);
        if (err) {
            const embed = buildWaguriEmbed(interaction, 'warning', { description: `🌸 ${err}` });
            return interaction.reply({ embeds: [embed] });
        }

        // Sảnh chờ — validate: phải đủ tiền cược
        const validate = async (userId) => {
            const u = await db.getUser(userId);
            return Number(u?.wallet || 0) >= bet ? null : `Cậu cần **${fmt(bet)}** ${config.CURRENCY} trong ví để tham gia ván này~ 😟`;
        };
        const players = await openLobby(interaction, {
            title: '🃏 Ba Cây',
            description: `Cược **${fmt(bet)}** ${config.CURRENCY}/người · điểm cao nhất ăn cả pot (nhà cái giữ ${Math.round(config.PARTY.HOUSE_CUT * 100)}%).`,
            minPlayers: 2, maxPlayers: 8, joinSeconds: config.PARTY.JOIN_SECONDS, validate,
        });
        if (!players) return; // hủy / không đủ người

        // Thu cược (ai hụt tiền do tiêu lúc chờ thì loại)
        const staked = [];
        for (const p of players) {
            if (await db.addMoney(p.id, -bet, 'wallet')) staked.push(p);
        }
        if (staked.length < 2) {
            for (const p of staked) await db.addMoney(p.id, bet, 'wallet');
            const embed = buildWaguriEmbed(interaction, 'warning', { description: 'Không đủ người đủ tiền để vào ván, đã hoàn cược~ 🌸' });
            return interaction.followUp({ embeds: [embed] });
        }

        // Chia bài & chấm điểm
        const deck = makeDeck();
        const results = staked.map(p => {
            const cards = [deck.pop(), deck.pop(), deck.pop()];
            return { ...p, cards, hand: evaluate(cards) };
        });
        let best = results[0];
        for (const r of results) if (cmp(r.hand, best.hand) > 0) best = r;
        const winners = results.filter(r => cmp(r.hand, best.hand) === 0);

        const pot = staked.length * bet;
        const prize = Math.floor(pot * (1 - config.PARTY.HOUSE_CUT));
        const share = Math.floor(prize / winners.length);
        for (const w of winners) await db.addMoney(w.id, share, 'wallet');
        for (const w of winners) db.questIncr(w.id, 'gamble_win', 1);

        const lines = results
            .sort((a, b) => cmp(b.hand, a.hand))
            .map(r => `${winners.includes(r) ? '👑' : '▫️'} <@${r.id}> — ${showCards(r.cards)} → **${r.hand.label}**`);
        const winMention = winners.map(w => `<@${w.id}>`).join(', ');

        const embed = buildWaguriEmbed(interaction, 'jackpot', {
            title: '🃏・Kết quả Ba Cây',
            description: `${lines.join('\n')}\n\n` +
                `💰 Pot: **${fmt(pot)}** ${config.CURRENCY} · 🏆 ${winMention} ${winners.length > 1 ? 'chia nhau' : 'ăn'} **${fmt(share)}** ${config.CURRENCY} mỗi người!`
        });
        
        embed.setFooter({
            text: `Nhà cái giữ ${Math.round(config.PARTY.HOUSE_CUT * 100)}% • ${embed.data.footer.text}`,
            iconURL: embed.data.footer.icon_url
        });

        await interaction.followUp({ embeds: [embed] });
    },
};

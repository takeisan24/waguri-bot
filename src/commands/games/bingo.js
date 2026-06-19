const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { openLobby } = require('../../lib/lobby');
const { checkBet } = require('../../lib/bet');

const fmt = n => Number(n).toLocaleString('vi-VN');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Nhãn số kiểu Bingo: cột B(1-15) I(16-30) N(31-45) G(46-60) O(61-75)
const label = n => ('BINGO'[Math.floor((n - 1) / 15)]) + n;

function pickN(min, max, n) {
    const pool = [];
    for (let i = min; i <= max; i++) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, n);
}
function genCard() {
    const cols = [pickN(1, 15, 5), pickN(16, 30, 5), pickN(31, 45, 5), pickN(46, 60, 5), pickN(61, 75, 5)];
    const grid = [];
    for (let r = 0; r < 5; r++) { grid.push([]); for (let c = 0; c < 5; c++) grid[r].push(cols[c][r]); }
    grid[2][2] = null; // ô FREE
    return grid;
}
const LINES = (() => {
    const L = [];
    for (let r = 0; r < 5; r++) L.push([[r, 0], [r, 1], [r, 2], [r, 3], [r, 4]]);
    for (let c = 0; c < 5; c++) L.push([[0, c], [1, c], [2, c], [3, c], [4, c]]);
    L.push([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]);
    L.push([[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]]);
    return L;
})();
const cellMarked = (grid, marked, r, c) => grid[r][c] === null || marked.has(grid[r][c]);
const hasBingo = (grid, marked) => LINES.some(line => line.every(([r, c]) => cellMarked(grid, marked, r, c)));
const bestProgress = (grid, marked) => Math.max(...LINES.map(line => line.filter(([r, c]) => cellMarked(grid, marked, r, c)).length));
function renderCard(grid, marked) {
    let out = '  B   I   N   G   O\n';
    for (let r = 0; r < 5; r++) {
        out += grid[r].map(v => {
            if (v === null) return '[★ ]';
            const s = String(v).padStart(2);
            return marked.has(v) ? `[${s}]` : ` ${s} `;
        }).join('') + '\n';
    }
    return '```\n' + out + '```';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bingo')
        .setDescription('Bingo 🎱 — nhiều người, gọi số tự động, ai đủ 1 hàng trước thì thắng')
        .addIntegerOption(o => o.setName('bet').setDescription('Phí vào cửa mỗi người').setRequired(true).setMinValue(config.GAMBLE.MIN_BET)),
    async execute(interaction) {
        const bet = interaction.options.getInteger('bet');
        const err = checkBet(bet);
        if (err) {
            const embed = buildWaguriEmbed(interaction, 'warning', { description: `🌸 ${err}` });
            return interaction.reply({ embeds: [embed] });
        }

        const validate = async (userId) => {
            const u = await db.getUser(userId);
            return Number(u?.wallet || 0) >= bet ? null : `Cậu cần **${fmt(bet)}** ${config.CURRENCY} trong ví để vào ván Bingo~ 😟`;
        };
        const players = await openLobby(interaction, {
            title: '🎱 Bingo',
            description: `Phí vào cửa **${fmt(bet)}** ${config.CURRENCY}/người · gọi số tự động, ai đủ 1 hàng/cột/chéo trước **thắng cả pot** (nhà cái giữ ${Math.round(config.PARTY.HOUSE_CUT * 100)}%).`,
            minPlayers: 2, maxPlayers: 6, joinSeconds: config.PARTY.JOIN_SECONDS, validate,
        });
        if (!players) return;

        const staked = [];
        for (const p of players) { if (await db.addMoney(p.id, -bet, 'wallet')) staked.push(p); }
        if (staked.length < 2) {
            for (const p of staked) await db.addMoney(p.id, bet, 'wallet');
            const embed = buildWaguriEmbed(interaction, 'warning', { description: 'Không đủ người đủ tiền để vào ván, đã hoàn cược~ 🌸' });
            return interaction.followUp({ embeds: [embed] });
        }

        const cards = staked.map(p => ({ ...p, grid: genCard(), marked: new Set() }));
        const pot = staked.length * bet;
        const pool = pickN(1, 75, 75); // thứ tự gọi
        const called = [];

        const progressView = (last) => {
            const lines = cards.map(c => {
                const prog = bestProgress(c.grid, c.marked);
                return `${'🟩'.repeat(prog)}${'⬜'.repeat(5 - prog)} <@${c.id}> (${prog}/5)`;
            });
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '🎱・Bingo đang quay!',
                description: (last ? `🔊 Số mới: **${label(last)}**\n` : '') +
                    `Đã gọi (${called.length}): ${called.map(label).join(', ') || '—'}\n\n` +
                    `**Tiến độ:**\n${lines.join('\n')}`
            });
            // footer cố định khi đang quay (tránh quote đổi mỗi lần gọi số gây nhấp nháy)
            embed.setFooter({ text: `🎱 Bingo • Pot: ${fmt(pot)} ${config.CURRENCY}`, iconURL: embed.data.footer.icon_url });
            return embed;
        };

        const msg = await interaction.followUp({ embeds: [progressView(null)] });

        let winner = null;
        for (const num of pool) {
            await sleep(2500);
            called.push(num);
            for (const c of cards) if (c.grid.flat().includes(num)) c.marked.add(num);
            winner = cards.find(c => hasBingo(c.grid, c.marked));
            if (winner) break;
            await msg.edit({ embeds: [progressView(num)] }).catch(() => {});
            if (called.length >= 55) break; // an toàn (gần như luôn có người thắng trước mốc này)
        }

        if (!winner) {
            // hiếm: chọn người tiến độ cao nhất
            winner = cards.reduce((a, b) => bestProgress(b.grid, b.marked) > bestProgress(a.grid, a.marked) ? b : a);
        }

        const prize = Math.floor(pot * (1 - config.PARTY.HOUSE_CUT));
        await db.addMoney(winner.id, prize, 'wallet');
        db.questIncr(winner.id, 'gamble_win', 1);

        await msg.edit({ embeds: [progressView(called[called.length - 1])] }).catch(() => {});
        
        const winEmbed = buildWaguriEmbed(interaction, 'jackpot', {
            title: '🎉・BINGO!',
            description: `🏆 <@${winner.id}> thắng **${fmt(prize)}** ${config.CURRENCY}!\n\nThẻ của người thắng:\n${renderCard(winner.grid, winner.marked)}`
        });
        winEmbed.setFooter({
            text: `Pot ${fmt(pot)} · nhà cái giữ ${Math.round(config.PARTY.HOUSE_CUT * 100)}% • ${winEmbed.data.footer.text}`,
            iconURL: winEmbed.data.footer.icon_url
        });
        await interaction.followUp({ embeds: [winEmbed] });
    },
};

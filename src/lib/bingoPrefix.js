const { EmbedBuilder } = require('discord.js');
const { randomUUID } = require('node:crypto');
const db = require('../database');
const config = require('../config');
const { buildWaguriEmbed } = require('./embed');

const activeBingoGames = new Map(); // channelId -> gameData

const DEFAULT_BET = config.BINGO?.DEFAULT_BET || 500;
const HOUSE_CUT = config.BINGO?.HOUSE_CUT || 0.05;

// Shuffles an array in place
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function hasActiveBingoGame(channelId) {
    return activeBingoGames.has(channelId);
}

function getActiveBingoGame(channelId) {
    return activeBingoGames.get(channelId);
}

// Voice channel helper
function getVoiceChannel(member) {
    return member?.voice?.channel;
}

// Nhãn số kiểu Bingo: cột B(1-15) I(16-30) N(31-45) G(46-60) O(61-75)
const label = n => ('BINGO'[Math.floor((n - 1) / 15)]) + n;

function pickN(min, max, n) {
    const pool = [];
    for (let i = min; i <= max; i++) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
}

function genCard() {
    const cols = [
        pickN(1, 15, 5),
        pickN(16, 30, 5),
        pickN(31, 45, 5),
        pickN(46, 60, 5),
        pickN(61, 75, 5)
    ];
    const grid = [];
    for (let r = 0; r < 5; r++) {
        grid.push([]);
        for (let c = 0; c < 5; c++) {
            grid[r].push(cols[c][r]);
        }
    }
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

async function handleBingoPrefix(message, cmd, args) {
    const channelId = message.channelId;
    const userId = message.author.id;

    if (cmd === 'bingo') {
        const voiceChannel = getVoiceChannel(message.member);
        if (!voiceChannel) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Cậu cần vào một phòng voice để mở game Bingo nha~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        const { hasActiveGame: hasActiveLotoGame } = require('./loto');
        if (activeBingoGames.has(channelId) || hasActiveLotoGame(channelId)) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Kênh này đang có một ván game đang chạy rồi cậu ơi~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        const sessionId = randomUUID();
        const timeout = setTimeout(async () => {
            const curGame = activeBingoGames.get(channelId);
            if (curGame && curGame.status === 'lobby' && curGame.sessionId === sessionId) {
                activeBingoGames.delete(channelId);
                await db.stakeRefundSession(curGame.sessionId);
                const embed = buildWaguriEmbed(message, 'warning', {
                    description: 'Phòng Bingo đã quá 10 phút chưa bắt đầu nên đã tự động hủy và hoàn vé cho mọi người! ⏰🌸'
                });
                message.channel.send({ embeds: [embed] }).catch(() => {});
            }
        }, 10 * 60 * 1000);

        activeBingoGames.set(channelId, {
            hostId: userId,
            hostTag: message.author.tag,
            voiceChannelName: voiceChannel.name,
            status: 'lobby',
            sessionId: sessionId, // để ghi/hoàn cược qua DB (chống mất tiền khi restart)
            players: new Map(), // userId -> { username, grid: genCard(), marked: new Set() }
            pool: shuffle(Array.from({ length: 75 }, (_, i) => i + 1)),
            called: [],
            msg: null,
            lobbyTimeout: timeout
        });

        const embed = buildWaguriEmbed(message, 'info', {
            title: '🎱・Phòng Chơi Bingo Đã Mở!',
            description:
                `Người mở game: <@${userId}> (phòng voice: **${voiceChannel.name}**)\n\n` +
                `**Cách tham gia:**\n` +
                `> Gõ lệnh: \`${config.PREFIX}mua\` để mua vé Bingo!\n` +
                `> Phí mua vé: **${DEFAULT_BET.toLocaleString('vi-VN')}** ${config.CURRENCY}.\n\n` +
                `*Gõ \`${config.PREFIX}check\` để kiểm tra vé của cậu. Người mở game có thể gõ \`${config.PREFIX}start\` để bắt đầu.* 🌸`
        });
        return message.reply({ embeds: [embed] });
    }

    if (cmd === 'mua') {
        const game = activeBingoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: `Hiện chưa có phòng Bingo nào mở ở kênh này hết á, gõ \`${config.PREFIX}bingo\` để mở nha~ 🌸`
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.status !== 'lobby') {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Ván Bingo đã bắt đầu quay rồi, cậu đợi ván sau nha~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.players.has(userId)) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Cậu đã mua vé cho ván này rồi nhé~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        // Thu cược qua DB (atomic: trừ ví + ghi dòng cược để hoàn nếu bot restart).
        const paid = await db.stakeCollect(game.sessionId, 'bingo', channelId, userId, DEFAULT_BET);
        if (!paid) {
            const embed = buildWaguriEmbed(message, 'error', {
                description: `Ví cậu không đủ **${DEFAULT_BET.toLocaleString('vi-VN')}** ${config.CURRENCY} để mua vé rồi~ 😟`
            });
            return message.reply({ embeds: [embed] });
        }

        const card = genCard();
        game.players.set(userId, {
            username: message.author.username,
            grid: card,
            marked: new Set()
        });

        const embed = buildWaguriEmbed(message, 'success', {
            description: `✅ **${message.author.username}** đã mua vé Bingo thành công (**-${DEFAULT_BET.toLocaleString('vi-VN')}** ${config.CURRENCY}).\n*Gõ \`${config.PREFIX}check\` để xem vé của mình.* 🌸`
        });
        return message.reply({ embeds: [embed] });
    }

    if (cmd === 'check') {
        const game = activeBingoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Hiện chưa có phòng Bingo nào mở ở kênh này hết á~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        const player = game.players.get(userId);
        if (!player) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Cậu chưa mua vé tham gia ván này nha~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        const cardStr = renderCard(player.grid, player.marked);
        const embed = buildWaguriEmbed(message, 'info', {
            title: `🎟️・Vé Bingo của ${player.username}`,
            description: `Dưới đây là vé Bingo của cậu:\n${cardStr}`
        });
        return message.reply({ embeds: [embed] });
    }

    if (cmd === 'start') {
        const game = activeBingoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Hiện chưa có phòng Bingo nào mở ở kênh này hết á~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.hostId !== userId) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Chỉ người mở game mới có quyền bắt đầu nha cậu~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.status !== 'lobby') {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Ván Bingo đã bắt đầu rồi cậu ơi~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.players.size < 2) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Cần ít nhất **2 người tham gia** để bắt đầu ván Bingo nha cậu! 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.lobbyTimeout) {
            clearTimeout(game.lobbyTimeout);
            game.lobbyTimeout = null;
        }
        game.status = 'playing';
        const pot = game.players.size * DEFAULT_BET;

        const renderProgress = (lastNum) => {
            const lines = Array.from(game.players.entries()).map(([pid, p]) => {
                const prog = bestProgress(p.grid, p.marked);
                return `${'🟩'.repeat(prog)}${'⬜'.repeat(5 - prog)} <@${pid}> (${prog}/5)`;
            });

            const embed = buildWaguriEmbed(message, 'info', {
                title: '🎱・Bingo Đang Gọi Số!',
                description:
                    (lastNum ? `🔊 Số mới gọi: **${label(lastNum)}**\n` : '') +
                    `Số đã gọi (${game.called.length}): ${game.called.map(label).join(', ') || 'chưa có'}\n\n` +
                    `**Tiến độ:**\n${lines.join('\n')}`
            });
            embed.setFooter({ text: `Bingo • Tổng Pot: ${pot.toLocaleString('vi-VN')} ${config.CURRENCY}`, iconURL: embed.data.footer.icon_url });
            return embed;
        };

        const drawMsg = await message.reply({ embeds: [renderProgress(null)] });
        game.msg = drawMsg;

        const interval = setInterval(async () => {
            const curGame = activeBingoGames.get(channelId);
            if (!curGame || curGame.status !== 'playing') {
                clearInterval(interval);
                return;
            }

            if (curGame.pool.length === 0) {
                clearInterval(interval);
                activeBingoGames.delete(channelId);
                await db.stakeRefundSession(curGame.sessionId); // hoà, không ai trúng -> hoàn vé
                const embed = buildWaguriEmbed(message, 'warning', {
                    description: 'Đã gọi hết 75 số mà không ai trúng, ván hoà — đã hoàn vé cho mọi người! 🌸'
                });
                return message.channel.send({ embeds: [embed] }).catch(() => {});
            }

            const nextNum = curGame.pool.pop();
            curGame.called.push(nextNum);

            // Mark for everyone
            for (const p of curGame.players.values()) {
                if (p.grid.flat().includes(nextNum)) {
                    p.marked.add(nextNum);
                }
            }

            // Check winners
            const winners = [];
            for (const [pid, p] of curGame.players.entries()) {
                if (hasBingo(p.grid, p.marked)) {
                    winners.push(pid);
                }
            }

            await curGame.msg.edit({ embeds: [renderProgress(nextNum)] }).catch(() => {});

            if (winners.length > 0) {
                clearInterval(interval);
                activeBingoGames.delete(channelId);

                const rawPrize = pot;
                const houseCut = Math.floor(rawPrize * HOUSE_CUT);
                const prize = rawPrize - houseCut;
                const splitPrize = Math.floor(prize / winners.length);

                for (const wid of winners) {
                    await db.addMoney(wid, splitPrize, 'wallet');
                    db.questIncr(wid, 'gamble_win', 1);
                }
                await db.stakeSettle(curGame.sessionId); // cược đã thành pot & trả thưởng -> xoá dòng

                const winnerMentions = winners.map(wid => `<@${wid}>`).join(', ');
                
                // Show cards of winners
                let winDesc = `🏆 Chúc mừng **${winnerMentions}** đã Bingo và giành chiến thắng!\n` +
                    `💰 Tiền thưởng nhận được: **${splitPrize.toLocaleString('vi-VN')}** ${config.CURRENCY} mỗi người!\n` +
                    `*(Tổng Pot: ${pot.toLocaleString('vi-VN')} ${config.CURRENCY}, nhà cái giữ ${HOUSE_CUT * 100}% phí)*\n\n` +
                    `Số đã gọi: **${curGame.called.map(label).join(', ')}**\n\n`;

                for (const wid of winners) {
                    const p = curGame.players.get(wid);
                    winDesc += `**Vé của <@${wid}>:**\n${renderCard(p.grid, p.marked)}\n`;
                }

                const winEmbed = buildWaguriEmbed(message, 'jackpot', {
                    title: '🎉・BINGO!',
                    description: winDesc
                });

                return message.channel.send({ content: winnerMentions, embeds: [winEmbed] }).catch(() => {});
            }
        }, 4000);
    }

    if (cmd === 'end') {
        const game = activeBingoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Hiện chưa có phòng Bingo nào mở ở kênh này hết á~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.hostId !== userId) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Chỉ người mở game mới có quyền hủy phòng nha cậu~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.lobbyTimeout) {
            clearTimeout(game.lobbyTimeout);
            game.lobbyTimeout = null;
        }
        // Hoàn vé cho mọi người đã mua (host huỷ ván) — qua DB, an toàn cả khi đang chơi.
        await db.stakeRefundSession(game.sessionId);
        activeBingoGames.delete(channelId);
        const embed = buildWaguriEmbed(message, 'success', {
            description: `✅ Đã kết thúc và dọn dẹp ván Bingo. Tiền vé đã được hoàn trả cho mọi người!`
        });
        return message.reply({ embeds: [embed] });
    }
}

module.exports = {
    handleBingoPrefix,
    activeBingoGames,
    hasActiveBingoGame,
    getActiveBingoGame,
    DEFAULT_BET,
    HOUSE_CUT,
    shuffle,
    getVoiceChannel,
    genCard,
    renderCard,
    hasBingo
};

const { EmbedBuilder } = require('discord.js');
const { randomUUID } = require('node:crypto');
const db = require('../database');
const config = require('../config');
const { buildWaguriEmbed } = require('./embed');
const { getInteractionLanguage, t } = require('./i18n');

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
    const locale = await getInteractionLanguage(message);
    const channelId = message.channelId;
    const userId = message.author.id;

    if (cmd === 'bingo') {
        const voiceChannel = getVoiceChannel(message.member);
        if (!voiceChannel) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.bingo.err_voice_required')
            });
            return message.reply({ embeds: [embed] });
        }

        const { hasActiveGame: hasActiveLotoGame } = require('./loto');
        if (activeBingoGames.has(channelId) || hasActiveLotoGame(channelId)) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.bingo.err_active_game')
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
                    locale,
                    description: t(locale, 'commands.bingo.lobby_timeout')
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
            lobbyTimeout: timeout,
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
            locale // store game locale
        });

        const embed = buildWaguriEmbed(message, 'info', {
            locale,
            title: t(locale, 'commands.bingo.lobby_opened_title'),
            description: t(locale, 'commands.bingo.lobby_opened_desc', {
                hostId,
                voiceName: voiceChannel.name,
                prefix: config.PREFIX,
                price: DEFAULT_BET.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
                currency: config.CURRENCY
            })
        });
        return message.reply({ embeds: [embed] });
    }

    if (cmd === 'mua') {
        const game = activeBingoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.bingo.err_no_lobby', { prefix: config.PREFIX })
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.status !== 'lobby') {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.bingo.err_already_started')
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.players.has(userId)) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.bingo.err_already_joined')
            });
            return message.reply({ embeds: [embed] });
        }

        // Thu cược qua DB (atomic: trừ ví + ghi dòng cược để hoàn nếu bot restart).
        const paid = await db.stakeCollect(game.sessionId, 'bingo', channelId, userId, DEFAULT_BET);
        if (!paid) {
            const embed = buildWaguriEmbed(message, 'error', {
                locale,
                description: t(locale, 'commands.bingo.err_insufficient_funds', {
                    price: DEFAULT_BET.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
                    currency: config.CURRENCY
                })
            });
            return message.reply({ embeds: [embed] });
        }

        const card = genCard();
        game.players.set(userId, {
            username: message.author.username,
            grid: card,
            marked: new Set()
        });
        game.lastActiveAt = Date.now();

        const embed = buildWaguriEmbed(message, 'success', {
            locale,
            description: t(locale, 'commands.bingo.join_success', {
                username: message.author.username,
                price: DEFAULT_BET.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
                currency: config.CURRENCY,
                prefix: config.PREFIX
            })
        });
        return message.reply({ embeds: [embed] });
    }

    if (cmd === 'check') {
        const game = activeBingoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.bingo.err_no_lobby_simple')
            });
            return message.reply({ embeds: [embed] });
        }
        game.lastActiveAt = Date.now();

        const player = game.players.get(userId);
        if (!player) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.bingo.err_no_players')
            });
            return message.reply({ embeds: [embed] });
        }

        const cardStr = renderCard(player.grid, player.marked);
        const embed = buildWaguriEmbed(message, 'info', {
            locale,
            title: t(locale, 'commands.bingo.ticket_title', { username: player.username }),
            description: t(locale, 'commands.bingo.ticket_desc', { cardStr })
        });
        return message.reply({ embeds: [embed] });
    }

    if (cmd === 'start') {
        const game = activeBingoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.bingo.err_no_lobby_simple')
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.hostId !== userId) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.bingo.err_not_host')
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.status !== 'lobby') {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.bingo.err_game_already_started')
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.players.size < 2) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.bingo.err_min_players', { min: 2 })
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.lobbyTimeout) {
            clearTimeout(game.lobbyTimeout);
            game.lobbyTimeout = null;
        }
        game.status = 'playing';
        game.lastActiveAt = Date.now();
        const pot = game.players.size * DEFAULT_BET;

        const renderProgress = (lastNum) => {
            const lines = Array.from(game.players.entries()).map(([pid, p]) => {
                const prog = bestProgress(p.grid, p.marked);
                return `${'🟩'.repeat(prog)}${'⬜'.repeat(5 - prog)} <@${pid}> (${prog}/5)`;
            });

            const embed = buildWaguriEmbed(message, 'info', {
                locale,
                title: t(locale, 'commands.bingo.calling_title'),
                description:
                    (lastNum ? t(locale, 'commands.bingo.calling_new_number', { number: label(lastNum) }) : '') +
                    t(locale, 'commands.bingo.calling_called_numbers', {
                        count: game.called.length,
                        called: game.called.map(label).join(', ') || t(locale, 'commands.bingo.calling_no_numbers'),
                        lines: lines.join('\n')
                    })
            });
            embed.setFooter({
                text: t(locale, 'commands.bingo.calling_footer', {
                    pot: pot.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
                    currency: config.CURRENCY
                }),
                iconURL: embed.data.footer.icon_url
            });
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
            curGame.lastActiveAt = Date.now();

            if (curGame.pool.length === 0) {
                clearInterval(interval);
                activeBingoGames.delete(channelId);
                await db.stakeRefundSession(curGame.sessionId); // hoà, không ai trúng -> hoàn vé
                const embed = buildWaguriEmbed(message, 'warning', {
                    locale,
                    description: t(locale, 'commands.bingo.draw_ended')
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
                let winDesc = t(locale, 'commands.bingo.win_desc_header', {
                    winners: winnerMentions,
                    prize: splitPrize.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
                    currency: config.CURRENCY,
                    pot: pot.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
                    cut: HOUSE_CUT * 100,
                    called: curGame.called.map(label).join(', ')
                });

                for (const wid of winners) {
                    const p = curGame.players.get(wid);
                    winDesc += t(locale, 'commands.bingo.win_desc_card', {
                        userId: wid,
                        cardStr: renderCard(p.grid, p.marked)
                    });
                }

                const winEmbed = buildWaguriEmbed(message, 'jackpot', {
                    locale,
                    title: t(locale, 'commands.bingo.win_title'),
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
                locale,
                description: t(locale, 'commands.bingo.err_no_lobby_simple')
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.hostId !== userId) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.bingo.err_not_host_cancel')
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
            locale,
            description: t(locale, 'commands.bingo.cancel_success')
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

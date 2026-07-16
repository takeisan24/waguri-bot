const { EmbedBuilder } = require('discord.js');
const { randomUUID } = require('node:crypto');
const db = require('../database');
const config = require('../config');
const { buildWaguriEmbed } = require('./embed');
const { getInteractionLanguage, t } = require('./i18n');

const activeLotoGames = new Map(); // channelId -> gameData

const TICKET_PRICE = config.LOTO?.TICKET_PRICE || 500;
const HOUSE_CUT = config.LOTO?.HOUSE_CUT || 0.05;

// Shuffles an array in place
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function hasActiveGame(channelId) {
    return activeLotoGames.has(channelId);
}

function getActiveGame(channelId) {
    return activeLotoGames.get(channelId);
}

// Helper to check voice connection of a member
function getVoiceChannel(member) {
    return member?.voice?.channel;
}

async function handleLotoPrefix(message, cmd, args) {
    const locale = await getInteractionLanguage(message);
    const channelId = message.channelId;
    const userId = message.author.id;

    if (cmd === 'loto') {
        const voiceChannel = getVoiceChannel(message.member);
        if (!voiceChannel) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.loto.err_voice_required')
            });
            return message.reply({ embeds: [embed] });
        }

        const { hasActiveBingoGame } = require('./bingoPrefix');
        if (activeLotoGames.has(channelId) || hasActiveBingoGame(channelId)) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.loto.err_active_game')
            });
            return message.reply({ embeds: [embed] });
        }

        const sessionId = randomUUID();
        const timeout = setTimeout(async () => {
            const curGame = activeLotoGames.get(channelId);
            if (curGame && curGame.status === 'lobby' && curGame.sessionId === sessionId) {
                activeLotoGames.delete(channelId);
                await db.stakeRefundSession(curGame.sessionId);
                const embed = buildWaguriEmbed(message, 'warning', {
                    locale,
                    description: t(locale, 'commands.loto.lobby_timeout')
                });
                message.channel.send({ embeds: [embed] }).catch(() => {});
            }
        }, 10 * 60 * 1000);

        activeLotoGames.set(channelId, {
            hostId: userId,
            hostTag: message.author.tag,
            voiceChannelName: voiceChannel.name,
            status: 'lobby',
            sessionId: sessionId, // để ghi/hoàn cược qua DB (chống mất tiền khi restart)
            players: new Map(),
            called: [],
            pool: shuffle(Array.from({ length: 90 }, (_, i) => i + 1)),
            msg: null,
            lobbyTimeout: timeout,
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
            locale // store game locale
        });

        const embed = buildWaguriEmbed(message, 'info', {
            locale,
            title: t(locale, 'commands.loto.lobby_opened_title'),
            description: t(locale, 'commands.loto.lobby_opened_desc', {
                hostId,
                voiceName: voiceChannel.name,
                prefix: config.PREFIX,
                price: TICKET_PRICE.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
                currency: config.CURRENCY
            })
        });
        return message.reply({ embeds: [embed] });
    }

    if (cmd === 'so') {
        const game = activeLotoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.loto.err_no_lobby', { prefix: config.PREFIX })
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.status !== 'lobby') {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.loto.err_already_started')
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.players.has(userId)) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.loto.err_already_joined')
            });
            return message.reply({ embeds: [embed] });
        }

        if (args.length !== 5) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.loto.err_invalid_count', { prefix: config.PREFIX })
            });
            return message.reply({ embeds: [embed] });
        }

        const numbers = [];
        for (const arg of args) {
            const num = parseInt(arg, 10);
            if (isNaN(num) || num < 1 || num > 90) {
                const embed = buildWaguriEmbed(message, 'warning', {
                    locale,
                    description: t(locale, 'commands.loto.err_invalid_number', { val: arg })
                });
                return message.reply({ embeds: [embed] });
            }
            const padded = String(num).padStart(2, '0');
            if (numbers.includes(padded)) {
                const embed = buildWaguriEmbed(message, 'warning', {
                    locale,
                    description: t(locale, 'commands.loto.err_duplicate_numbers')
                });
                return message.reply({ embeds: [embed] });
            }
            numbers.push(padded);
        }

        // Thu cược qua DB (atomic: trừ ví + ghi dòng cược để hoàn nếu bot restart).
        const paid = await db.stakeCollect(game.sessionId, 'loto', channelId, userId, TICKET_PRICE);
        if (!paid) {
            const embed = buildWaguriEmbed(message, 'error', {
                locale,
                description: t(locale, 'commands.loto.err_insufficient_funds', {
                    price: TICKET_PRICE.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
                    currency: config.CURRENCY
                })
            });
            return message.reply({ embeds: [embed] });
        }
        game.players.set(userId, {
            username: message.author.username,
            ticket: numbers
        });
        game.lastActiveAt = Date.now();

        const embed = buildWaguriEmbed(message, 'success', {
            locale,
            description: t(locale, 'commands.loto.join_success', {
                username: message.author.username,
                numbers: numbers.join('  '),
                price: TICKET_PRICE.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
                currency: config.CURRENCY
            })
        });
        return message.reply({ embeds: [embed] });
    }

    if (cmd === 'ds') {
        const game = activeLotoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.loto.err_no_lobby_simple')
            });
            return message.reply({ embeds: [embed] });
        }
        game.lastActiveAt = Date.now();

        if (game.players.size === 0) {
            const embed = buildWaguriEmbed(message, 'info', {
                locale,
                description: t(locale, 'commands.loto.err_no_players')
            });
            return message.reply({ embeds: [embed] });
        }

        const lines = Array.from(game.players.entries()).map(([pid, p]) => {
            return `• <@${pid}>: \`${p.ticket.join('  ')}\``;
        });

        const embed = buildWaguriEmbed(message, 'info', {
            locale,
            title: t(locale, 'commands.loto.ticket_list_title', { count: game.players.size }),
            description: lines.join('\n')
        });
        return message.reply({ embeds: [embed] });
    }

    if (cmd === 'start') {
        const game = activeLotoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.loto.err_no_lobby_simple')
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.hostId !== userId) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.loto.err_not_host')
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.status !== 'lobby') {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.loto.err_game_already_started')
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.players.size < 2) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.loto.err_min_players', { min: 2 })
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.lobbyTimeout) {
            clearTimeout(game.lobbyTimeout);
            game.lobbyTimeout = null;
        }
        game.status = 'playing';
        game.lastActiveAt = Date.now();
        const pot = game.players.size * TICKET_PRICE;

        const renderProgress = (lastNum) => {
            const lines = Array.from(game.players.entries()).map(([pid, p]) => {
                const matchCount = p.ticket.filter(num => game.called.includes(num)).length;
                const formattedTicket = p.ticket.map(num => {
                    return game.called.includes(num) ? `[${num}]` : ` ${num} `;
                }).join(' ');
                return `• <@${pid}>: \`${formattedTicket}\` **(${matchCount}/5)**`;
            });

            const embed = buildWaguriEmbed(message, 'info', {
                locale,
                title: t(locale, 'commands.loto.calling_title'),
                description:
                    (lastNum ? t(locale, 'commands.loto.calling_new_number', { number: lastNum }) : '') +
                    t(locale, 'commands.loto.calling_called_numbers', {
                        count: game.called.length,
                        called: game.called.join(', ') || t(locale, 'commands.loto.calling_no_numbers'),
                        lines: lines.join('\n')
                    })
            });
            embed.setFooter({
                text: t(locale, 'commands.loto.calling_footer', {
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
            const curGame = activeLotoGames.get(channelId);
            if (!curGame || curGame.status !== 'playing') {
                clearInterval(interval);
                return;
            }
            curGame.lastActiveAt = Date.now();

            if (curGame.pool.length === 0) {
                clearInterval(interval);
                activeLotoGames.delete(channelId);
                await db.stakeRefundSession(curGame.sessionId); // hoà, không ai trúng -> hoàn vé
                const embed = buildWaguriEmbed(message, 'warning', {
                    locale,
                    description: t(locale, 'commands.loto.draw_ended')
                });
                return message.channel.send({ embeds: [embed] }).catch(() => {});
            }

            const nextNum = curGame.pool.pop();
            const paddedNum = String(nextNum).padStart(2, '0');
            curGame.called.push(paddedNum);

            const winners = [];
            for (const [pid, p] of curGame.players.entries()) {
                if (p.ticket.every(num => curGame.called.includes(num))) {
                    winners.push(pid);
                }
            }

            // Chốt ván ĐỒNG BỘ trước mọi await để tick kế tiếp không tái nhập -> trả thưởng 2 lần (double-payout).
            if (winners.length > 0) {
                clearInterval(interval);
                curGame.status = 'done';
                activeLotoGames.delete(channelId);
            }

            await curGame.msg.edit({ embeds: [renderProgress(paddedNum)] }).catch(() => {});

            if (winners.length > 0) {
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
                const winEmbed = buildWaguriEmbed(message, 'jackpot', {
                    locale,
                    title: t(locale, 'commands.loto.win_title'),
                    description: t(locale, 'commands.loto.win_desc', {
                        winners: winnerMentions,
                        prize: splitPrize.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
                        currency: config.CURRENCY,
                        pot: pot.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
                        cut: HOUSE_CUT * 100,
                        called: curGame.called.join(', ')
                    })
                });

                return message.channel.send({ content: winnerMentions, embeds: [winEmbed] }).catch(() => {});
            }
        }, 4000);
    }

    if (cmd === 'end') {
        const game = activeLotoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.loto.err_no_lobby_simple')
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.hostId !== userId) {
            const embed = buildWaguriEmbed(message, 'warning', {
                locale,
                description: t(locale, 'commands.loto.err_not_host_cancel')
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.lobbyTimeout) {
            clearTimeout(game.lobbyTimeout);
            game.lobbyTimeout = null;
        }
        // Hoàn vé cho mọi người đã mua (host huỷ ván) — qua DB, an toàn cả khi đang chơi.
        await db.stakeRefundSession(game.sessionId);
        activeLotoGames.delete(channelId);
        const embed = buildWaguriEmbed(message, 'success', {
            locale,
            description: t(locale, 'commands.loto.cancel_success')
        });
        return message.reply({ embeds: [embed] });
    }
}

module.exports = {
    handleLotoPrefix,
    activeLotoGames,
    hasActiveGame,
    getActiveGame,
    TICKET_PRICE,
    HOUSE_CUT,
    shuffle,
    getVoiceChannel
};

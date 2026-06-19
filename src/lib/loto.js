const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const config = require('../config');
const { buildWaguriEmbed } = require('./embed');

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
    const channelId = message.channelId;
    const userId = message.author.id;

    if (cmd === 'loto') {
        const voiceChannel = getVoiceChannel(message.member);
        if (!voiceChannel) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Cậu cần vào một phòng voice để mở game Loto nha~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        const { hasActiveBingoGame } = require('./bingoPrefix');
        if (activeLotoGames.has(channelId) || hasActiveBingoGame(channelId)) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Kênh này đang có một ván game đang chạy rồi cậu ơi~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        activeLotoGames.set(channelId, {
            hostId: userId,
            hostTag: message.author.tag,
            voiceChannelName: voiceChannel.name,
            status: 'lobby',
            players: new Map(),
            called: [],
            pool: shuffle(Array.from({ length: 90 }, (_, i) => i + 1)),
            msg: null
        });

        const embed = buildWaguriEmbed(message, 'info', {
            title: '🎟️・Phòng Chơi Loto Đã Mở!',
            description: 
                `Người mở game: <@${userId}> (phòng voice: **${voiceChannel.name}**)\n\n` +
                `**Cách tham gia:**\n` +
                `> Gõ lệnh: \`${config.PREFIX}so <5 số từ 01-90>\` để mua vé Loto!\n` +
                `> Ví dụ: \`${config.PREFIX}so 05 12 45 67 89\`\n` +
                `> Phí mua vé: **${TICKET_PRICE.toLocaleString('vi-VN')}** ${config.CURRENCY}.\n\n` +
                `*Gõ \`${config.PREFIX}ds\` để xem danh sách vé đã mua. Người mở game có thể gõ \`${config.PREFIX}start\` để bắt đầu.* 🌸`
        });
        return message.reply({ embeds: [embed] });
    }

    if (cmd === 'so') {
        const game = activeLotoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: `Hiện chưa có phòng Loto nào mở ở kênh này hết á, gõ \`${config.PREFIX}loto\` để mở nha~ 🌸`
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.status !== 'lobby') {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Ván Loto đã bắt đầu quay rồi, cậu đợi ván sau nha~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.players.has(userId)) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Cậu đã mua vé cho ván này rồi nhé~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        if (args.length !== 5) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: `Cậu cần chọn đúng **5 số** từ 01 đến 90 nha!\nVí dụ: \`${config.PREFIX}so 01 15 27 42 89\` 🌸`
            });
            return message.reply({ embeds: [embed] });
        }

        const numbers = [];
        for (const arg of args) {
            const num = parseInt(arg, 10);
            if (isNaN(num) || num < 1 || num > 90) {
                const embed = buildWaguriEmbed(message, 'warning', {
                    description: `Số \`${arg}\` không hợp lệ. Số phải từ **01 đến 90** nha cậu! 🌸`
                });
                return message.reply({ embeds: [embed] });
            }
            const padded = String(num).padStart(2, '0');
            if (numbers.includes(padded)) {
                const embed = buildWaguriEmbed(message, 'warning', {
                    description: 'Các số trong vé không được trùng nhau nha cậu! 🌸'
                });
                return message.reply({ embeds: [embed] });
            }
            numbers.push(padded);
        }

        const u = await db.getUser(userId);
        if (Number(u?.wallet || 0) < TICKET_PRICE) {
            const embed = buildWaguriEmbed(message, 'error', {
                description: `Ví cậu không đủ **${TICKET_PRICE.toLocaleString('vi-VN')}** ${config.CURRENCY} để mua vé rồi~ 😟`
            });
            return message.reply({ embeds: [embed] });
        }

        await db.addMoney(userId, -TICKET_PRICE, 'wallet');
        game.players.set(userId, {
            username: message.author.username,
            ticket: numbers
        });

        const embed = buildWaguriEmbed(message, 'success', {
            description: `✅ **${message.author.username}** đã mua vé thành công: \`${numbers.join('  ')}\` (**-${TICKET_PRICE.toLocaleString('vi-VN')}** ${config.CURRENCY}). Chúc cậu may mắn!`
        });
        return message.reply({ embeds: [embed] });
    }

    if (cmd === 'ds') {
        const game = activeLotoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Hiện chưa có phòng Loto nào mở ở kênh này hết á~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.players.size === 0) {
            const embed = buildWaguriEmbed(message, 'info', {
                description: 'Chưa có ai mua vé tham gia ván này hết trơn á~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        const lines = Array.from(game.players.entries()).map(([pid, p]) => {
            return `• <@${pid}>: \`${p.ticket.join('  ')}\``;
        });

        const embed = buildWaguriEmbed(message, 'info', {
            title: `🎟️・Danh Sách Vé Loto (${game.players.size} người)`,
            description: lines.join('\n')
        });
        return message.reply({ embeds: [embed] });
    }

    if (cmd === 'start') {
        const game = activeLotoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Hiện chưa có phòng Loto nào mở ở kênh này hết á~ 🌸'
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
                description: 'Ván Loto đã bắt đầu rồi cậu ơi~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.players.size < 2) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Cần ít nhất **2 người tham gia** để bắt đầu ván Loto nha cậu! 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        game.status = 'playing';
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
                title: '🎱・Loto Đang Gọi Số!',
                description:
                    (lastNum ? `🔊 Số mới gọi: **${lastNum}**\n` : '') +
                    `Số đã gọi (${game.called.length}): ${game.called.join(', ') || 'chưa có'}\n\n` +
                    `**Danh sách vé:**\n${lines.join('\n')}`
            });
            embed.setFooter({ text: `Loto • Tổng Pot: ${pot.toLocaleString('vi-VN')} ${config.CURRENCY}`, iconURL: embed.data.footer.icon_url });
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

            if (curGame.pool.length === 0) {
                clearInterval(interval);
                activeLotoGames.delete(channelId);
                const embed = buildWaguriEmbed(message, 'warning', {
                    description: 'Đã gọi hết 90 số mà không ai trúng, ván đấu kết thúc hòa! 🌸'
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

            await curGame.msg.edit({ embeds: [renderProgress(paddedNum)] }).catch(() => {});

            if (winners.length > 0) {
                clearInterval(interval);
                activeLotoGames.delete(channelId);

                const rawPrize = pot;
                const houseCut = Math.floor(rawPrize * HOUSE_CUT);
                const prize = rawPrize - houseCut;
                const splitPrize = Math.floor(prize / winners.length);

                for (const wid of winners) {
                    await db.addMoney(wid, splitPrize, 'wallet');
                    db.questIncr(wid, 'gamble_win', 1);
                }

                const winnerMentions = winners.map(wid => `<@${wid}>`).join(', ');
                const winEmbed = buildWaguriEmbed(message, 'jackpot', {
                    title: '🎉・KINH LOTO!',
                    description: 
                        `🏆 Chúc mừng **${winnerMentions}** đã Kinh (trúng đủ 5 số) và giành chiến thắng!\n` +
                        `💰 Tiền thưởng nhận được: **${splitPrize.toLocaleString('vi-VN')}** ${config.CURRENCY} mỗi người!\n` +
                        `*(Tổng Pot: ${pot.toLocaleString('vi-VN')} ${config.CURRENCY}, nhà cái giữ ${HOUSE_CUT * 100}% phí)*\n\n` +
                        `Các số trúng: **${curGame.called.join(', ')}**`
                });

                return message.channel.send({ content: winnerMentions, embeds: [winEmbed] }).catch(() => {});
            }
        }, 4000);
    }

    if (cmd === 'end') {
        const game = activeLotoGames.get(channelId);
        if (!game) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Hiện chưa có phòng Loto nào mở ở kênh này hết á~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.hostId !== userId) {
            const embed = buildWaguriEmbed(message, 'warning', {
                description: 'Chỉ người mở game mới có quyền hủy phòng nha cậu~ 🌸'
            });
            return message.reply({ embeds: [embed] });
        }

        if (game.status === 'lobby') {
            for (const pid of game.players.keys()) {
                await db.addMoney(pid, TICKET_PRICE, 'wallet');
            }
        }

        activeLotoGames.delete(channelId);
        const embed = buildWaguriEmbed(message, 'success', {
            description: `✅ Đã kết thúc và dọn dẹp ván Loto. Tiền vé đã được hoàn trả (nếu chưa bắt đầu)!`
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

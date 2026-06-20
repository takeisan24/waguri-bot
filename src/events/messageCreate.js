const { Events } = require('discord.js');
const config = require('../config');
const db = require('../database.js');
const { buildPrefixInteraction } = require('../lib/prefixShim');
const { chatWithWaguri, onCooldown } = require('../lib/ai');
const { handleMessage: handleNoiTu } = require('../lib/noitu');
const { rateLimited } = require('../lib/ratelimit');
const { isBanned } = require('../lib/bans');
const { isBlocked, getJail } = require('../lib/jail');
const { PIG_CMDS, handlePigPrefix } = require('../lib/pig');
const { PLANT_CMDS, handlePlantPrefix } = require('../lib/plant');
const { recordMembership } = require('../lib/membership');

// Chat-leveling: thưởng xu/EXP khi chat (có cooldown + cap ngày chống farm)
const chatCD = new Map();    // userId -> hết cooldown (ms)
const chatDaily = new Map(); // userId -> { date, count }

// Dọn rác định kỳ (tránh phình RAM trên bot public). .unref() để không giữ tiến trình sống.
setInterval(() => {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    for (const [uid, exp] of chatCD) if (exp < now) chatCD.delete(uid);
    for (const [uid, d] of chatDaily) if (d.date !== today) chatDaily.delete(uid);
}, 30 * 60 * 1000).unref();

const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
function grantChatReward(message) {
    if (message.content.trim().length < config.CHAT.MIN_LEN) return;
    const now = Date.now();
    if (now < (chatCD.get(message.author.id) || 0)) return;

    // Cap số lượt thưởng/ngày (reset theo ngày)
    const today = new Date().toISOString().slice(0, 10);
    const d = chatDaily.get(message.author.id);
    if (d && d.date === today) {
        if (d.count >= config.CHAT.DAILY_CAP) return;
        d.count++;
    } else {
        chatDaily.set(message.author.id, { date: today, count: 1 });
    }

    chatCD.set(message.author.id, now + config.CHAT.COOLDOWN_MS);
    db.addMoney(message.author.id, rand(config.CHAT.MIN_COINS, config.CHAT.MAX_COINS), 'wallet');
    db.updateExp(message.author.id, rand(config.CHAT.MIN_EXP, config.CHAT.MAX_EXP));
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;
        if (isBanned(message.author.id)) return;
        recordMembership(message.guild.id, message.author.id); // BXH theo server — fire-and-forget

        const prefix = config.PREFIX;

        // --- 1) Lệnh prefix (vd: w!work) ---
        if (message.content.startsWith(prefix)) {
            const tokens = message.content.slice(prefix.length).trim().split(/\s+/);
            const cmdName = (tokens.shift() || '').toLowerCase();
            if (!cmdName) return;

            // --- Intercept lệnh prefix nuôi heo (w!muaheo, w!heoan, ...) ---
            if (PIG_CMDS.has(cmdName)) {
                if (rateLimited(message.author.id)) {
                    message.reply('Cậu thao tác hơi nhanh rồi~ chờ vài giây nhé! 🌸').catch(() => {});
                    return;
                }
                try {
                    await handlePigPrefix(message, cmdName, tokens);
                } catch (error) {
                    console.error(`Lỗi prefix ${prefix}${cmdName}:`, error);
                    message.reply('Ơ, có lỗi rồi, cậu thử lại sau nhé~ 🌸').catch(() => {});
                }
                return;
            }

            // --- Intercept lệnh prefix trồng cây (w!muagiong, w!tuoinuoc, ...) ---
            if (PLANT_CMDS.has(cmdName)) {
                if (rateLimited(message.author.id)) {
                    message.reply('Cậu thao tác hơi nhanh rồi~ chờ vài giây nhé! 🌸').catch(() => {});
                    return;
                }
                try {
                    await handlePlantPrefix(message, cmdName, tokens);
                } catch (error) {
                    console.error(`Lỗi prefix ${prefix}${cmdName}:`, error);
                    message.reply('Ơ, có lỗi rồi, cậu thử lại sau nhé~ 🌸').catch(() => {});
                }
                return;
            }

            // --- Intercept Loto & Bingo prefix commands ---
            const { handleLotoPrefix, activeLotoGames } = require('../lib/loto');
            const { handleBingoPrefix, activeBingoGames } = require('../lib/bingoPrefix');

            if (['loto', 'so', 'ds'].includes(cmdName)) {
                if (rateLimited(message.author.id)) {
                    message.reply('Cậu thao tác hơi nhanh rồi~ chờ vài giây nhé! 🌸').catch(() => {});
                    return;
                }
                try {
                    await handleLotoPrefix(message, cmdName, tokens);
                } catch (error) {
                    console.error(`Lỗi prefix ${prefix}${cmdName}:`, error);
                    message.reply('Ơ, có lỗi rồi, cậu thử lại sau nhé~ 🌸').catch(() => {});
                }
                return;
            }

            if (['bingo', 'mua', 'check'].includes(cmdName)) {
                if (rateLimited(message.author.id)) {
                    message.reply('Cậu thao tác hơi nhanh rồi~ chờ vài giây nhé! 🌸').catch(() => {});
                    return;
                }
                try {
                    await handleBingoPrefix(message, cmdName, tokens);
                } catch (error) {
                    console.error(`Lỗi prefix ${prefix}${cmdName}:`, error);
                    message.reply('Ơ, có lỗi rồi, cậu thử lại sau nhé~ 🌸').catch(() => {});
                }
                return;
            }

            if (['start', 'end'].includes(cmdName)) {
                if (rateLimited(message.author.id)) {
                    message.reply('Cậu thao tác hơi nhanh rồi~ chờ vài giây nhé! 🌸').catch(() => {});
                    return;
                }
                try {
                    const channelId = message.channelId;
                    if (activeLotoGames.has(channelId)) {
                        await handleLotoPrefix(message, cmdName, tokens);
                    } else if (activeBingoGames.has(channelId)) {
                        await handleBingoPrefix(message, cmdName, tokens);
                    } else {
                        message.reply('Hiện không có phòng game Loto hay Bingo nào hoạt động ở kênh này hết á~ 🌸').catch(() => {});
                    }
                } catch (error) {
                    console.error(`Lỗi prefix ${prefix}${cmdName}:`, error);
                    message.reply('Ơ, có lỗi rồi, cậu thử lại sau nhé~ 🌸').catch(() => {});
                }
                return;
            }

            const command = message.client.commands.get(cmdName);
            if (!command) return;

            if (rateLimited(message.author.id)) {
                message.reply('Cậu thao tác hơi nhanh rồi~ chờ vài giây nhé! 🌸').catch(() => {});
                return;
            }

            // Chặn khi đang bị giam (lệnh kiếm tiền/cờ bạc/trộm)
            if (isBlocked(cmdName)) {
                const jail = await getJail(message.author.id);
                if (jail) {
                    message.reply(`🚓 Cậu đang bị giam${jail.reason ? ` (**${jail.reason}**)` : ''}, được thả <t:${Math.floor(jail.until / 1000)}:R> nhé~ 🌸`).catch(() => {});
                    return;
                }
            }

            try {
                const shim = await buildPrefixInteraction(message, command, tokens);
                await command.execute(shim);
            } catch (error) {
                console.error(`Lỗi prefix ${prefix}${cmdName}:`, error);
                message.reply('Ơ, có lỗi rồi, cậu thử lại sau nhé~ 🌸').catch(() => {});
            }
            return;
        }

        // --- 2) Trò chuyện AI khi @mention Waguri ---
        if (message.mentions.has(message.client.user, { ignoreEveryone: true, ignoreRoles: true })) {
            const text = message.content.replace(/<@!?\d+>/g, '').trim();
            if (!text) return;

            // Cấu hình AI theo server (admin đặt qua /config ai)
            const gs = await db.getGuildSettings(message.guild.id);
            if (gs.ai_enabled === '0') return;                                   // AI bị tắt ở server này
            if (gs.ai_channel && gs.ai_channel !== message.channelId) return;    // chỉ trả lời ở kênh chỉ định

            if (onCooldown(message.author.id)) return;
            await message.channel.sendTyping().catch(() => {});
            const res = await chatWithWaguri(message.channelId, message.author.id, message.author.username, text);
            if (!res.ok) {
                if (res.reason === 'quota') {
                    message.reply(`Cậu đã dùng hết **${res.cap}** lượt chat với mình hôm nay rồi 🥺 — nâng cấp \`/premium\` để có thêm nhé 💎`).catch(() => {});
                }
                return;
            }
            message.reply(res.reply.slice(0, 2000)).catch(() => {});
            return;
        }

        // --- 3) Chat thường: thưởng chat-leveling + nối từ (nếu có ván) ---
        grantChatReward(message);
        await handleNoiTu(message);
    },
};

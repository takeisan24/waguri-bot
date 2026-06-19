const { Events } = require('discord.js');
const config = require('../config');
const db = require('../database.js');
const { buildPrefixInteraction } = require('../lib/prefixShim');
const { chatWithWaguri, onCooldown } = require('../lib/ai');
const { handleMessage: handleNoiTu } = require('../lib/noitu');
const { rateLimited } = require('../lib/ratelimit');

// Chat-leveling: thưởng xu/EXP khi chat (có cooldown + cap ngày chống farm)
const chatCD = new Map();    // userId -> hết cooldown (ms)
const chatDaily = new Map(); // userId -> { date, count }
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

        const prefix = config.PREFIX;

        // --- 1) Lệnh prefix (vd: w!work) ---
        if (message.content.startsWith(prefix)) {
            const tokens = message.content.slice(prefix.length).trim().split(/\s+/);
            const cmdName = (tokens.shift() || '').toLowerCase();
            if (!cmdName) return;

            const command = message.client.commands.get(cmdName);
            if (!command) return;

            if (rateLimited(message.author.id)) {
                message.reply('Cậu thao tác hơi nhanh rồi~ chờ vài giây nhé! 🌸').catch(() => {});
                return;
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
            if (onCooldown(message.author.id)) return;
            await message.channel.sendTyping().catch(() => {});
            const reply = await chatWithWaguri(message.channelId, message.author.id, message.author.username, text);
            if (reply) message.reply(reply.slice(0, 2000)).catch(() => {});
            return;
        }

        // --- 3) Chat thường: thưởng chat-leveling + nối từ (nếu có ván) ---
        grantChatReward(message);
        await handleNoiTu(message);
    },
};

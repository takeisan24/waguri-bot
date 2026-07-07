const { Events } = require('discord.js');
const config = require('../config');
const db = require('../database.js');
const { getInteractionLanguage, t } = require('../lib/i18n');
const { buildPrefixInteraction } = require('../lib/prefixShim');
const { chatWithWaguri, onCooldown } = require('../lib/ai');
const { handleMessage: handleNoiTu } = require('../lib/noitu');
const { rateLimited } = require('../lib/ratelimit');
const { isBanned } = require('../lib/bans');
const { isBlocked, getJail } = require('../lib/jail');
const { PIG_CMDS, handlePigPrefix } = require('../lib/pig');
const { PLANT_CMDS, handlePlantPrefix } = require('../lib/plant');
const { recordMembership } = require('../lib/membership');

// Chat-leveling: thưởng xu/EXP khi chat. Cooldown RAM (chống spam, tiền-lọc); cap NGÀY ở DB
// (qua claimDailyCounter) -> không farm được qua restart hay nhiều shard.
const chatCD = new Map(); // userId -> hết cooldown (ms)

// Alias prefix cũ -> lệnh mới (giữ người quen tay không hụt lệnh sau khi đổi tên / gộp lệnh).
// Giá trị: chuỗi = đổi tên (w!ngu -> nghingoi); {cmd,sub} = gộp vào lệnh con (w!trano -> vay tra).
const PREFIX_ALIASES = {
    // 1. Ảnh
    cat: { cmd: 'image', sub: 'cat' },
    dog: { cmd: 'image', sub: 'dog' },
    waifu: { cmd: 'image', sub: 'waifu' },

    // 2. Tương tác
    hug: { cmd: 'action', sub: 'hug' },
    kiss: { cmd: 'action', sub: 'kiss' },
    pat: { cmd: 'action', sub: 'pat' },
    poke: { cmd: 'action', sub: 'poke' },
    slap: { cmd: 'action', sub: 'slap' },

    // 3. Hôn nhân
    marry: { cmd: 'couple', sub: 'marry' },
    divorce: { cmd: 'couple', sub: 'divorce' },
    relationship: { cmd: 'couple', sub: 'status' },

    // 4. Cửa hàng
    shop: { cmd: 'store', sub: 'list' },
    buy: { cmd: 'store', sub: 'buy' },
    sell: { cmd: 'store', sub: 'sell' },

    // 5. Tài chính & Ngân hàng
    balance: { cmd: 'bank', sub: 'balance' },
    bal: { cmd: 'bank', sub: 'balance' },
    deposit: { cmd: 'bank', sub: 'gui' },
    withdraw: { cmd: 'bank', sub: 'rut' },

    // 6. Bot
    ping: { cmd: 'bot', sub: 'ping' },
    about: { cmd: 'bot', sub: 'about' },
    support: { cmd: 'bot', sub: 'support' },
    invite: { cmd: 'bot', sub: 'invite' },

    // Giữ nguyên các alias cũ khác
    ngu: 'nghingoi',
    trano: { cmd: 'vay', sub: 'tra' },
    donno: { cmd: 'vay', sub: 'doi' },
    no: { cmd: 'vay', sub: 'so' },
};

// Dọn rác cooldown định kỳ (tránh phình RAM). .unref() để không giữ tiến trình sống.
setInterval(() => {
    const now = Date.now();
    for (const [uid, exp] of chatCD) if (exp < now) chatCD.delete(uid);
}, 30 * 60 * 1000).unref();

const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
async function grantChatReward(message) {
    if (message.content.trim().length < config.CHAT.MIN_LEN) return;
    const now = Date.now();
    const uid = message.author.id;
    if (now < (chatCD.get(uid) || 0)) return;
    chatCD.set(uid, now + config.CHAT.COOLDOWN_MS); // throttle: vừa chống spam vừa giảm gọi DB

    // Cap ngày ở DB (atomic, đếm theo ngày) -> -1 nghĩa là đã chạm cap hôm nay.
    if (await db.claimDailyCounter(uid, 'chat', config.CHAT.DAILY_CAP) === -1) return;
    db.addMoney(uid, rand(config.CHAT.MIN_COINS, config.CHAT.MAX_COINS), 'wallet');
    db.updateExp(uid, rand(config.CHAT.MIN_EXP, config.CHAT.MAX_EXP));
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
            const rawCmd = (tokens.shift() || '').toLowerCase();
            if (!rawCmd) return;
            const alias = PREFIX_ALIASES[rawCmd];
            let cmdName = rawCmd;
            if (typeof alias === 'string') cmdName = alias;                        // đổi tên (w!ngu -> nghingoi)
            else if (alias) { cmdName = alias.cmd; tokens.unshift(alias.sub); }     // gộp lệnh con (w!trano -> vay tra)

            // Tương thích prefix CŨ: trước đây w!vay @người 5000 vay trực tiếp (chưa có lệnh con).
            // Sau khi gộp, nếu token đầu KHÔNG phải lệnh con hợp lệ -> mặc định về lệnh con phổ biến nhất.
            const DEFAULT_SUB = { vay: { subs: ['muon', 'tra', 'doi', 'so'], def: 'muon' } };
            const ds = DEFAULT_SUB[cmdName];
            if (ds && !ds.subs.includes((tokens[0] || '').toLowerCase())) tokens.unshift(ds.def);

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
            
            const locale = await getInteractionLanguage({
                guildId: message.guildId,
                user: message.author,
                guildLocale: message.guild?.preferredLocale
            });

            const res = await chatWithWaguri(message.channelId, message.author.id, message.author.username, text, locale);
            if (!res.ok) {
                if (res.reason === 'quota') {
                    const quotaMsg = t(locale, 'common.ai_quota_exceeded', { cap: res.cap });
                    message.reply(quotaMsg).catch(() => {});
                }
                return;
            }
            message.reply(res.reply.slice(0, 2000)).catch(() => {});
            return;
        }

        // --- 3) Chat thường: thưởng chat-leveling + nối từ (nếu có ván) ---
        grantChatReward(message).catch(() => {}); // fire-and-forget (đã async vì có call DB)
        await handleNoiTu(message);
    },
};

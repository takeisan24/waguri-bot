const { Events } = require('discord.js');
const config = require('../config');
const db = require('../database.js');
const { getInteractionLanguage, t, detectVietnamese } = require('../lib/i18n');
const { buildPrefixInteraction } = require('../lib/prefixShim');
const { PREFIX_ALIASES } = require('../lib/prefixTen');
const { logError } = require('../lib/logger');
const { chatWithWaguri, onCooldown } = require('../lib/ai');
const { dungDauVao, ghep } = require('../lib/ai/dauVao');
const { handleMessage: handleNoiTu } = require('../lib/noitu');
const { announceLevelUp } = require('../lib/levelAnnounce');
const { rateLimited } = require('../lib/ratelimit');
const { isBanned } = require('../lib/bans');
const { isBlocked, getJail } = require('../lib/jail');
const { PIG_CMDS, handlePigPrefix } = require('../lib/pig');
const { PLANT_CMDS, handlePlantPrefix } = require('../lib/plant');
const { recordMembership } = require('../lib/membership');

// Chat-leveling: thưởng xu/EXP khi chat. Cooldown RAM (chống spam, tiền-lọc); cap NGÀY ở DB
// (qua claimDailyCounter) -> không farm được qua restart hay nhiều shard.
const chatCD = new Map(); // userId -> hết cooldown (ms)

// Bảng gõ tắt nay ở `lib/prefixTen.js` — dùng CHUNG với `/help`, nên danh sách hiện
// ra cho người dùng không thể lệch với danh sách thật sự định tuyến được.

// Nhắc "sai kênh" — mỗi người mỗi server chỉ nhắc lại sau 10 phút. Không có nó thì người
// @mention liên tục sẽ bị dội lại liên tục, biến một lời chỉ đường thành phiền nhiễu.
const nhacKenhCD = new Map(); // `${guildId}:${userId}` -> hết cooldown (ms)
const NHAC_KENH_MS = 10 * 60 * 1000;

// Dọn rác cooldown định kỳ (tránh phình RAM). .unref() để không giữ tiến trình sống.
setInterval(() => {
    const now = Date.now();
    for (const [uid, exp] of chatCD) if (exp < now) chatCD.delete(uid);
    for (const [k, exp] of nhacKenhCD) if (exp < now) nhacKenhCD.delete(k);
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

    // EXP: giữ lại giá trị trả về thay vì vứt đi. Trước đây dòng này là fire-and-forget nên
    // KHÔNG AI từng được báo là mình lên cấp — xem src/lib/levelAnnounce.js.
    const gained = rand(config.CHAT.MIN_EXP, config.CHAT.MAX_EXP);
    const newExp = await db.updateExp(uid, gained);
    await announceLevelUp(message, newExp, gained);
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;
        if (isBanned(message.author.id)) return;
        recordMembership(message.guild.id, message.author.id); // BXH theo server — fire-and-forget

        // Tự động đồng bộ role cấp độ nếu gửi tin nhắn ở Server Support
        if (message.guild.id === config.ROLE_REWARDS.SUPPORT_GUILD_ID && message.member) {
            const { syncSupportGuildRoles } = require('../lib/supportReward');
            const user = await db.getUser(message.author.id);
            if (user) {
                const { getLevelFromExp } = require('../lib/leveling');
                const level = getLevelFromExp(Number(user.exp || 0));
                syncSupportGuildRoles(message.member, level).catch(e => {
                    console.error('[ROLE SYNC ERROR] messageCreate:', e);
                    logError('Lỗi đồng bộ role', e, { guild: message.guildId });
                });
            }
        }

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

            // Intercept Lệnh Bí Mật Easter Egg HVL - MCK (w!hvl, w!mck)
            if (cmdName === 'hvl' || cmdName === 'mck') {
                try {
                    const { startHvlPlayer } = require('../lib/hvlPlayer');
                    // Shim nhẹ — Easter Egg không phải slash command nên không dùng buildPrefixInteraction
                    const shimState = { sent: null, deferred: false, replied: false };
                    const shimSend = async (payload) => {
                        const body = typeof payload === 'string' ? { content: payload } : { ...payload };
                        delete body.flags;
                        if (shimState.sent) return shimState.sent.edit(body).catch(() => null);
                        shimState.sent = await message.reply(body).catch(() => null);
                        shimState.replied = true;
                        return shimState.sent;
                    };
                    // Lệnh prefix không có hạn ack 3 giây nên tra ngôn ngữ ở đây là an toàn.
                    const hvlLocale = await getInteractionLanguage({
                        guildId: message.guildId,
                        user: message.author,
                        guildLocale: message.guild?.preferredLocale
                    });
                    await startHvlPlayer({
                        user: message.author,
                        member: message.member,
                        guild: message.guild,
                        guildId: message.guildId,
                        channel: message.channel,
                        client: message.client,
                        get deferred() { return shimState.deferred; },
                        get replied() { return shimState.replied; },
                        deferReply: async () => { shimState.deferred = true; await message.channel.sendTyping().catch(() => {}); },
                        editReply: shimSend,
                        reply: shimSend,
                    }, hvlLocale);
                } catch (error) {
                    console.error('[EASTER EGG ERROR] w!hvl:', error);
                    logError('Lỗi easter egg w!hvl', error, { user: `<@${message.author.id}>`, guild: message.guildId });
                }
                return;
            }

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
                    logError('Lỗi lệnh prefix', error, { command: `${prefix}${cmdName}`, user: `<@${message.author.id}>`, guild: message.guildId });
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
                    logError('Lỗi lệnh prefix', error, { command: `${prefix}${cmdName}`, user: `<@${message.author.id}>`, guild: message.guildId });
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
                    logError('Lỗi lệnh prefix', error, { command: `${prefix}${cmdName}`, user: `<@${message.author.id}>`, guild: message.guildId });
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
                    logError('Lỗi lệnh prefix', error, { command: `${prefix}${cmdName}`, user: `<@${message.author.id}>`, guild: message.guildId });
                    message.reply('Ơ, có lỗi rồi, cậu thử lại sau nhé~ 🌸').catch(() => {});
                }
                return;
            }

            // `start` và `end` là tên chung: vừa là lệnh điều khiển phòng Loto/Bingo, vừa là
            // lệnh onboarding `/start`. Chỉ chiếm quyền KHI kênh này đang có phòng thật; nếu
            // không thì `w!start` phải rơi xuống lệnh /start bên dưới. Trước đây nhánh này
            // return vô điều kiện, nên người mới gõ `w!start` nhận về câu "không có phòng
            // game nào" — lệnh onboarding không thể gọi bằng prefix.
            if (['start', 'end'].includes(cmdName)) {
                const channelId = message.channelId;
                const coPhong = activeLotoGames.has(channelId) || activeBingoGames.has(channelId);
                if (coPhong || cmdName === 'end') {
                    if (rateLimited(message.author.id)) {
                        message.reply('Cậu thao tác hơi nhanh rồi~ chờ vài giây nhé! 🌸').catch(() => {});
                        return;
                    }
                    try {
                        if (activeLotoGames.has(channelId)) {
                            await handleLotoPrefix(message, cmdName, tokens);
                        } else if (activeBingoGames.has(channelId)) {
                            await handleBingoPrefix(message, cmdName, tokens);
                        } else {
                            message.reply('Hiện không có phòng game Loto hay Bingo nào hoạt động ở kênh này hết á~ 🌸').catch(() => {});
                        }
                    } catch (error) {
                        console.error(`Lỗi prefix ${prefix}${cmdName}:`, error);
                        logError('Lỗi lệnh prefix', error, { command: `${prefix}${cmdName}`, user: `<@${message.author.id}>`, guild: message.guildId });
                        message.reply('Ơ, có lỗi rồi, cậu thử lại sau nhé~ 🌸').catch(() => {});
                    }
                    return;
                }
                // không có phòng + cmdName === 'start' -> rơi xuống, để lệnh /start xử lý
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

                // CỬA CHẶN: thiếu tham số BẮT BUỘC thì chỉ đường, đừng để lệnh tự nổ.
                //
                // Discord ép tham số bắt buộc ở phía client cho slash; đường prefix không
                // đi qua Discord nên không ai ép. Trước cửa này, `w!eco-admin trace` (thiếu
                // mention) làm `getUser()` trả null rồi `who.id` ném TypeError, và người
                // dùng chỉ nhận một câu báo lỗi chung — không biết mình thiếu gì.
                // Quét ngày 21-08: 88/209 đơn vị có tham số bắt buộc, 4 chỗ deref null.
                if (shim.thieuBatBuoc && shim.thieuBatBuoc.length) {
                    const { cuPhapDonVi } = require('../lib/cuPhap');
                    const locale = await getInteractionLanguage(shim);
                    const cp = cuPhapDonVi(command.data.toJSON(), shim.options.getSubcommand(), prefix);
                    await message.reply(t(locale, 'common.thieu_tham_so', {
                        thieu: shim.thieuBatBuoc.map(n => `\`<${n}>\``).join(', '),
                        cuphap: cp,
                    })).catch(() => {});
                    return;
                }

                await command.execute(shim);
            } catch (error) {
                console.error(`Lỗi prefix ${prefix}${cmdName}:`, error);
                logError('Lỗi lệnh prefix', error, { command: `${prefix}${cmdName}`, user: `<@${message.author.id}>`, guild: message.guildId });
                message.reply('Ơ, có lỗi rồi, cậu thử lại sau nhé~ 🌸').catch(() => {});
            }
            return;
        }

        // --- 2) Trò chuyện AI khi @mention Waguri ---
        if (message.mentions.has(message.client.user, { ignoreEveryone: true, ignoreRoles: true })) {
            // Nạp tin đang được trả lời (nếu có) TRƯỚC khi dựng đầu vào — ngữ cảnh reply và
            // ảnh trong tin đó đều lấy từ đây, nên chỉ tốn đúng một lần gọi.
            let tinTraLoi = null;
            if (message.reference?.messageId) {
                tinTraLoi = await message.channel.messages
                    .fetch(message.reference.messageId).catch(() => null);
                // Trả lời chính Waguri thì không cần trích lại lời cô ấy — nó đã nằm trong
                // lịch sử hội thoại rồi, trích nữa là tốn token để nói cùng một thứ hai lần.
                if (tinTraLoi?.author?.id === message.client.user.id) tinTraLoi = null;
            }

            const dv = dungDauVao(message, tinTraLoi);

            // Chỉ bỏ qua khi tin RỖNG HOÀN TOÀN. Trước đây `if (!text) return` khiến tin chỉ
            // có ảnh bị nuốt im lặng — người dùng không phân biệt nổi với bot hỏng.
            if (!dv.coGiDo) return;

            const text = ghep(dv.text, dv.nhan);

            // Cấu hình AI theo server (admin đặt qua /config ai)
            const gs = await db.getGuildSettings(message.guild.id);
            // AI bị admin tắt ở server này -> im lặng CÓ CHỦ Ý. Đó là quyết định của admin;
            // một con bot cứ đáp "tớ không được phép nói chuyện ở đây" thì chính nó đang nói
            // chuyện, tức phá đúng thứ admin vừa tắt.
            if (gs.ai_enabled === '0') return;

            // Sai kênh -> CHỈ ĐƯỜNG, đừng im lặng.
            //
            // Đo 2026-08-19: 75/374 lượt tham gia server nằm ở server giới hạn AI vào một kênh.
            // Trước đây họ @mention Waguri ở kênh thường và không nhận được GÌ CẢ — đọc như bot
            // hỏng hoặc như cô ấy phớt lờ. Chỉ đường vừa tôn trọng ý admin (gom AI về một kênh)
            // vừa xoá chỗ mơ hồ.
            if (gs.ai_channel && gs.ai_channel !== message.channelId) {
                // Kênh đã bị xoá -> setting cũ, chỉ đường sẽ ra link hỏng. Thà im lặng.
                const kenhAI = message.guild.channels.cache.get(gs.ai_channel);
                if (!kenhAI) return;

                const khoaNhac = `${message.guild.id}:${message.author.id}`;
                if (Date.now() < (nhacKenhCD.get(khoaNhac) || 0)) return;
                nhacKenhCD.set(khoaNhac, Date.now() + NHAC_KENH_MS);

                const localeNhac = await getInteractionLanguage({
                    guildId: message.guildId,
                    user: message.author,
                    guildLocale: message.guild?.preferredLocale,
                });
                message.reply({
                    content: t(localeNhac, 'common.ai_wrong_channel', { channel: `<#${gs.ai_channel}>` }),
                    allowedMentions: { parse: [] },
                }).catch(() => {});
                return;
            }

            if (onCooldown(message.author.id)) return;
            await message.channel.sendTyping().catch(() => {});
            
            // `locale:` lấy từ CHÍNH CHỮ người ta vừa gõ. Đường @mention không có
            // `interaction.locale` (thứ chỉ slash command mới có), nên bậc 3 của
            // getInteractionLanguage bị bỏ qua và quyết định rơi xuống `guild.preferredLocale`
            // — giá trị mà Discord mặc định là en-US cho gần như mọi server.
            //
            // Hậu quả đo được 2026-08-19: 298/306 người có `users.locale` rỗng, nên hầu hết
            // thông điệp hệ thống hiện ra tiếng Anh giữa một cuộc trò chuyện tiếng Việt.
            // Câu trả lời AI vẫn tiếng Việt (model bám theo người dùng) nên lỗi bị che.
            //
            // Có dấu tiếng Việt là bằng chứng mạnh hơn hẳn mặc định của Discord. Truyền vào
            // bậc 3 nên nó cũng KÍCH HOẠT phần học ngôn ngữ, dần lấp chỗ rỗng kia.
            const locale = await getInteractionLanguage({
                guildId: message.guildId,
                user: message.author,
                locale: detectVietnamese(text) || undefined,
                guildLocale: message.guild?.preferredLocale
            });

            const res = await chatWithWaguri(message.channelId, message.author.id, message.author.username, text, locale);
            if (!res.ok) {
                if (res.reason === 'quota_global') {
                    // Ngân sách CHUNG cạn — lỗi không thuộc về người này, đừng nói "cậu hết lượt".
                    message.reply(t(locale, 'common.ai_quota_global')).catch(() => {});
                } else if (res.reason === 'quota') {
                    const quotaMsg = t(locale, 'common.ai_quota_exceeded', { cap: res.cap });
                    message.reply(quotaMsg).catch(() => {});
                }
                return;
            }
            // allowedMentions rỗng: chặn AI bị "mồi" để @everyone/@here/tag role hàng loạt (prompt injection).
            message.reply({ content: res.reply.slice(0, 2000), allowedMentions: { parse: [] } }).catch(() => {});
            return;
        }

        // --- 3) Chat thường: thưởng chat-leveling + nối từ (nếu có ván) ---
        grantChatReward(message).catch(() => {}); // fire-and-forget (đã async vì có call DB)
        await handleNoiTu(message);
    },
};

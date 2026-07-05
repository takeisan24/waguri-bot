// Lớp điều phối AI: chọn provider theo config, giữ ngữ cảnh theo kênh, chống spam.
const config = require('../../config');
const db = require('../../database.js');
const { WAGURI_SYSTEM_PROMPT, tierOf } = require('./persona');
const { getLevelFromExp } = require('../leveling');
const { getEventInfo } = require('../event');
const { activeSeasons, SEASON_LABEL } = require('../season');

const gemini = require('./gemini'); // provider AI duy nhất: Google Gemini

const contexts = new Map();  // channelId -> [{role,content}]
const ctxSeen = new Map();   // channelId -> lần hoạt động gần nhất (ms) — để dọn ngữ cảnh cũ
const cooldowns = new Map(); // userId -> timestamp hết cooldown

// Dọn rác định kỳ: tránh phình RAM trên bot public chạy lâu (nhiều kênh/người).
// .unref() để timer không giữ tiến trình sống khi tắt bot.
const CONTEXT_TTL_MS = 60 * 60 * 1000; // 1h không trò chuyện -> xoá ngữ cảnh kênh
setInterval(() => {
    const now = Date.now();
    for (const [cid, t] of ctxSeen) {
        if (now - t > CONTEXT_TTL_MS) { contexts.delete(cid); ctxSeen.delete(cid); }
    }
    for (const [uid, exp] of cooldowns) {
        if (exp < now) cooldowns.delete(uid);
    }
}, 10 * 60 * 1000).unref();

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Hậu xử lý câu trả lời: thay tên người dùng bằng @mention + bọc /lệnh trong `code`
function formatReply(text, userId, userName) {
    let t = text;
    if (userName && userId) {
        t = t.replace(new RegExp(escapeRegex(userName), 'g'), `<@${userId}>`);
    }
    t = t.replace(/(?<!`)\/([a-zA-Z]{2,})(?!`)/g, '`/$1`'); // /work -> `/work`
    return t;
}

function getProvider() {
    return gemini;
}

/** True nếu user đang trong cooldown (đồng thời đặt cooldown mới). */
function onCooldown(userId) {
    const now = Date.now();
    if (now < (cooldowns.get(userId) || 0)) return true;
    cooldowns.set(userId, now + config.AI.USER_COOLDOWN_MS);
    return false;
}

/**
 * Trò chuyện với Waguri.
 * Trả object: {ok:true, reply} | {ok:false, reason:'quota', used, cap, premium} | {ok:false, reason:'error'}
 */
async function chatWithWaguri(channelId, userId, userName, userText) {
    // Quota AI hằng ngày (Premium nhiều lượt hơn).
    // FAIL-CLOSED: DB lỗi (q == null) -> KHÔNG gọi AI, tránh rò rỉ chi phí / lạm dụng khi quota
    // không đếm được. (Khác cooldown game vốn fail-open vì không tốn tiền.)
    const q = await db.consumeAiQuota(userId, config.AI.FREE_DAILY, config.AI.PREMIUM_DAILY);
    if (!q) return { ok: false, reason: 'error' };
    if (q.allowed === false) {
        return { ok: false, reason: 'quota', used: q.used, cap: q.cap, premium: q.premium };
    }

    const provider = getProvider();
    const ctxKey = `${channelId}:${userId}`; // ngữ cảnh riêng từng người trong kênh (tránh trộn hội thoại)
    let history = contexts.get(ctxKey) || [];
    const framed = `${userName}: ${userText}`;

    // Mức thiện cảm + ngữ cảnh thực tế -> cá nhân hóa persona sinh động.
    let aff = 0, level = 1, hasPartner = false;
    let jobName = null, petInfo = null, bakeryInfo = null, conditionInfo = null;
    try {
        const u = await db.getUser(userId);
        if (u) {
            aff = Number(u.affection || 0);
            level = getLevelFromExp(Number(u.exp || 0));
            hasPartner = !!u.partner_id;
            if (u.job_id) {
                const job = await db.getJob(u.job_id);
                if (job) jobName = job.name;
            }
            const health = u.health !== undefined ? u.health : 100;
            if (u.sick) {
                conditionInfo = `đang bị bệnh 🤒 (sức khỏe ${health}/100)`;
            } else if (health < 50) {
                conditionInfo = `đang hơi yếu/mệt mỏi (sức khỏe ${health}/100)`;
            }
        }
        const pet = await db.getPet(userId);
        if (pet) {
            const { petLevel, findSpecies } = require('../../data/pets');
            const sp = findSpecies(pet.species);
            const pLvl = petLevel(pet.exp);
            petInfo = `nuôi bé ${sp ? sp.name : pet.species} tên "${pet.name || (sp ? sp.name : 'thú cưng')}" Lv.${pLvl}`;
        }
        const bakery = await db.getBakery(userId);
        if (bakery) {
            bakeryInfo = `làm chủ Tiệm Bánh Gekka Lv.${bakery.level}`;
        }
    } catch { /* bỏ qua */ }
    const t = tierOf(aff);
    const ctxBits = [`Level ${level}`];
    if (hasPartner) ctxBits.push('đã kết đôi với người khác trong game');
    if (jobName) ctxBits.push(`làm nghề "${jobName}"`);
    if (conditionInfo) ctxBits.push(conditionInfo);
    if (petInfo) ctxBits.push(petInfo);
    if (bakeryInfo) ctxBits.push(bakeryInfo);
    
    let systemPrompt = `${WAGURI_SYSTEM_PROMPT}\n\n[Người đang trò chuyện: ${userName} — thân thiết: ${t.name} (${aff} điểm); ${ctxBits.join('; ')}. Hãy trò chuyện ${t.guide}. Có thể nhắc khéo tới tiến độ hoặc thông tin này khi hợp ngữ cảnh một cách tự nhiên.]`;

    // Bối cảnh thời sự: sự kiện toàn cục + mùa lễ VN -> Waguri có thể nhắc khéo cho sống động.
    const nowBits = [];
    const ev = getEventInfo();
    if (ev.active) nowBits.push(`đang có sự kiện "${ev.name || 'đặc biệt'}" nhân x${ev.mult} thu nhập/EXP toàn server`);
    const seas = [...activeSeasons()].map(s => SEASON_LABEL[s]).filter(Boolean);
    if (seas.length) nowBits.push(`đang vào mùa ${seas.join(' & ')}`);
    if (nowBits.length) systemPrompt += `\n[Bối cảnh hôm nay: ${nowBits.join('; ')}. Nếu hợp ngữ cảnh, nhắc tới một cách tự nhiên & vui vẻ, đừng gượng ép.]`;

    let reply;
    try {
        reply = await provider.chat(systemPrompt, history, framed);
    } catch (error) {
        console.error('[AI ERROR]', error.message);
        return { ok: false, reason: 'error' };
    }
    if (!reply) return { ok: false, reason: 'error' };
    reply = formatReply(reply, userId, userName); // @mention + bọc lệnh trong `code`

    db.incrAffection(userId, 1); // trò chuyện làm Waguri thân thiết hơn

    // Cập nhật ngữ cảnh, cắt bớt và đảm bảo bắt đầu bằng 'user' (Gemini yêu cầu)
    history = [...history, { role: 'user', content: framed }, { role: 'assistant', content: reply }];
    const max = config.AI.MAX_CONTEXT_TURNS * 2;
    if (history.length > max) history = history.slice(history.length - max);
    if (history[0] && history[0].role === 'assistant') history = history.slice(1);
    contexts.set(ctxKey, history);
    ctxSeen.set(ctxKey, Date.now()); // mốc hoạt động để dọn ngữ cảnh cũ

    return { ok: true, reply };
}

module.exports = { chatWithWaguri, onCooldown };

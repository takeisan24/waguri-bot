// Lớp điều phối AI: chọn provider theo config, giữ ngữ cảnh theo kênh, chống spam.
const config = require('../../config');
const db = require('../../database.js');
const { WAGURI_SYSTEM_PROMPT, tierOf } = require('./persona');

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
    if (userName) t = t.replace(new RegExp(escapeRegex(userName), 'g'), `**${userName}**`);
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
    let history = contexts.get(channelId) || [];
    const framed = `${userName}: ${userText}`;

    // Mức thiện cảm -> điều chỉnh độ thân mật của persona
    let aff = 0;
    try { const u = await db.getUser(userId); aff = Number(u?.affection || 0); } catch { /* bỏ qua */ }
    const t = tierOf(aff);
    const systemPrompt = `${WAGURI_SYSTEM_PROMPT}\n\n[Mức thân thiết với ${userName}: ${t.name} (${aff} điểm). Hãy trò chuyện ${t.guide}.]`;

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
    contexts.set(channelId, history);
    ctxSeen.set(channelId, Date.now()); // mốc hoạt động để dọn ngữ cảnh cũ

    return { ok: true, reply };
}

module.exports = { chatWithWaguri, onCooldown };

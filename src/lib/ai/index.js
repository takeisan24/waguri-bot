// Lớp điều phối AI: chọn provider theo config, giữ ngữ cảnh theo kênh, chống spam.
const config = require('../../config');
const db = require('../../database.js');
const { WAGURI_SYSTEM_PROMPT, tierOf } = require('./persona');
const { getLevelFromExp } = require('../leveling');
const { getEventInfo } = require('../event');
const { activeSeasons, SEASON_LABEL } = require('../season');

const gemini = require('./gemini'); // provider AI duy nhất: Google Gemini

let mangaLore = {};
try {
    mangaLore = require('../../data/manga_lore.json');
} catch (e) {
    console.warn('[SYSTEM WARNING] Failed to load manga_lore.json:', e.message);
}

function findMatchingLore(text) {
    if (!text) return [];
    const normalized = text.toLowerCase();
    const matches = [];
    if (normalized.includes('bánh su kem') || normalized.includes('creampuff')) {
        if (mangaLore.banh_su_kem) matches.push(mangaLore.banh_su_kem);
    }
    if (normalized.includes('bánh ngọt') || normalized.includes('bánh nướng') || normalized.includes('tiệm bánh')) {
        if (mangaLore.banh_ngot) matches.push(mangaLore.banh_ngot);
    }
    if (normalized.includes('học tập') || normalized.includes('học hành') || normalized.includes('thi cử') || normalized.includes('kiểm tra') || normalized.includes('bài tập')) {
        if (mangaLore.hoc_tap) matches.push(mangaLore.hoc_tap);
    }
    if (normalized.includes('che ô') || normalized.includes('mưa') || normalized.includes('trời mưa') || normalized.includes('chiếc ô')) {
        if (mangaLore.che_o) matches.push(mangaLore.che_o);
    }
    if (normalized.includes('subaru') || normalized.includes('hoshina')) {
        if (mangaLore.subaru) matches.push(mangaLore.subaru);
    }
    if (normalized.includes('rintaro') || normalized.includes('tsumugi')) {
        if (mangaLore.rintaro) matches.push(mangaLore.rintaro);
    }
    return matches.slice(0, 2); // Tối đa chèn 2 ý ngữ cảnh để không làm phình prompt
}

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

// ---- Ký ức Waguri: trích & lưu thông tin đáng nhớ từ chính câu trả lời ----
// Waguri tự gắn marker ẩn [[NHO: khoá | giá trị]] khi biết điều đáng nhớ; ta lưu rồi XOÁ khỏi reply.
const MEMORY_MAX_KEYS = 25;       // trần số khoá/người -> chống phình JSONB
const MEMORY_KEY_MAX = 40;
const MEMORY_VALUE_MAX = 150;
const MEMORY_MAX_PER_REPLY = 2;   // tối đa 2 điều mỗi lượt -> tránh nhồi
const MEMORY_MARKER = () => /\[\[\s*NHO\s*:\s*([^|\]]+?)\s*\|\s*([^\]]+?)\s*\]\]/gi;

// Chuẩn hoá khoá: bỏ dấu tiếng Việt, còn a-z0-9_ ngắn gọn (vd "Món ăn yêu thích" -> "mon_an_yeu_thich").
function sanitizeMemoryKey(raw) {
    return String(raw).toLowerCase().trim()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, MEMORY_KEY_MAX);
}

/** PURE: tách marker khỏi câu trả lời. Trả { facts:[{key,value}], cleaned }. (testable) */
function parseMemoryMarkers(rawReply) {
    const facts = [];
    if (rawReply && rawReply.includes('[[')) {
        const re = MEMORY_MARKER();
        let m;
        while ((m = re.exec(rawReply)) !== null) {
            const key = sanitizeMemoryKey(m[1]);
            const value = String(m[2]).trim().slice(0, MEMORY_VALUE_MAX);
            if (key && value) facts.push({ key, value });
        }
    }
    const cleaned = typeof rawReply === 'string'
        ? rawReply.replace(MEMORY_MARKER(), '').replace(/\n{3,}/g, '\n\n').trim()
        : rawReply;
    return { facts, cleaned };
}

/** Trích marker -> lưu (fire-and-forget, tôn trọng trần) -> trả câu trả lời đã loại marker. */
function extractAndStoreMemory(rawReply, userId, existingMemory) {
    const { facts, cleaned } = parseMemoryMarkers(rawReply);
    if (!facts.length) return cleaned;
    const existing = existingMemory && typeof existingMemory === 'object' ? existingMemory : {};
    let stored = 0;
    for (const { key, value } of facts) {
        if (stored >= MEMORY_MAX_PER_REPLY) break;
        // Khoá cũ luôn cho cập nhật (vd tâm trạng); khoá mới chỉ thêm khi chưa vượt trần.
        const isNew = !(key in existing);
        if (isNew && Object.keys(existing).length + stored >= MEMORY_MAX_KEYS) continue;
        db.updateAiMemory(userId, key, value); // helper tự try/catch, không chặn reply
        stored++;
    }
    return cleaned;
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
async function chatWithWaguri(channelId, userId, userName, userText, locale) {
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
    let memory = null; // ký ức Waguri về người này (Key-Value)
    try {
        const u = await db.getUser(userId);
        if (u) {
            aff = Number(u.affection || 0);
            if (u.ai_memory && typeof u.ai_memory === 'object') memory = u.ai_memory;
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
    
    // Bổ sung hướng dẫn đặc biệt cho các tier tình cảm cao
    let specialGuide = '';
    if (aff >= 300) {
        specialGuide = 'Xưng hô cực kỳ ngọt ngào thân mật ("cậu - mình" hoặc gọi tri kỷ), thể hiện tình cảm gắn bó đặc biệt sâu sắc, xem họ là tri âm tri kỷ số một.';
    } else if (aff >= 120) {
        specialGuide = 'Trò chuyện cực kỳ ấm áp, quan tâm lo lắng từng chút một, thỉnh thoảng trêu đùa nhẹ nhàng.';
    }

    let systemPrompt = `${WAGURI_SYSTEM_PROMPT}\n\n[Người đang trò chuyện: ${userName} — thân thiết: ${t.name} (${aff} điểm); ${ctxBits.join('; ')}. Hãy trò chuyện ${t.guide}. ${specialGuide} Có thể chủ động hoặc khéo léo nhắc tới các thông tin này (như tiệm bánh của họ, thú cưng của họ) một cách tự nhiên và sinh động khi hợp ngữ cảnh.]`;

    // Ký ức Waguri: những mẩu thông tin cô ấy đã nhớ về người này -> nhắc lại tự nhiên cho thân mật.
    if (memory) {
        const bits = Object.entries(memory)
            .filter(([k, v]) => k && v != null && String(v).trim())
            .map(([k, v]) => `${k}: ${String(v).slice(0, 200)}`);
        if (bits.length) {
            systemPrompt += `\n[Điều Waguri còn nhớ về ${userName}: ${bits.join('; ')}. Nếu hợp ngữ cảnh, nhắc lại một cách tự nhiên & ấm áp để thể hiện mình nhớ họ, đừng liệt kê máy móc.]`;
        }
    }

    // Hướng dẫn Waguri TỰ lưu ký ức: gắn marker ẩn khi biết điều đáng nhớ (marker sẽ bị lược trước khi gửi).
    systemPrompt += `\n[Ghi nhớ: nếu trong lúc trò chuyện cậu biết được một điều đáng nhớ & lâu dài về ${userName} (tên thật/biệt danh, sở thích, món ăn yêu thích, tên thú cưng, dự định quan trọng, tâm trạng nổi bật...), hãy ghi lại bằng cách thêm vào CUỐI câu trả lời một dòng ẩn đúng định dạng: [[NHO: khoa | gia tri]] — khoá ngắn không dấu (vd ten, mon_an_yeu_thich, ten_pet, tam_trang). Tối đa 1 điều mỗi lần, chỉ khi thật sự đáng nhớ, KHÔNG bịa. Người dùng sẽ không nhìn thấy dòng này.]`;

    // Bối cảnh thời sự: sự kiện toàn cục + mùa lễ VN -> Waguri có thể nhắc khéo cho sống động.
    const nowBits = [];
    const ev = getEventInfo();
    if (ev.active) nowBits.push(`đang có sự kiện "${ev.name || 'đặc biệt'}" nhân x${ev.mult} thu nhập/EXP toàn server`);
    const seas = [...activeSeasons()].map(s => SEASON_LABEL[s]).filter(Boolean);
    if (seas.length) nowBits.push(`đang vào mùa ${seas.join(' & ')}`);
    if (nowBits.length) systemPrompt += `\n[Bối cảnh hôm nay: ${nowBits.join('; ')}. Nếu hợp ngữ cảnh, nhắc tới một cách tự nhiên & vui vẻ, đừng gượng ép.]`;

    // Nhạy bén thời gian theo buổi
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 9) {
        systemPrompt += `\n[Thời gian: Bây giờ là buổi sáng sớm. Waguri nên gửi lời chúc ngày mới ấm áp và nhắc người dùng nhớ ăn sáng đầy đủ nhé.]`;
    } else if (hour >= 23 || hour < 4) {
        systemPrompt += `\n[Thời gian: Bây giờ là đêm muộn rồi. Waguri hãy dịu dàng khuyên người dùng đi ngủ sớm, thể hiện sự lo lắng chân thành cho sức khoẻ của họ nhé.]`;
    }

    // Quét từ khoá manga lore
    const matchedLore = findMatchingLore(userText);
    for (const loreFact of matchedLore) {
        systemPrompt += `\n[Lore truyện: ${loreFact}]`;
    }

    // 💡 Chỉ thị ngôn ngữ ép Gemini phản hồi theo locale
    if (locale && locale.toLowerCase().startsWith('en')) {
        systemPrompt += `\n[Ngôn ngữ: Người dùng đang sử dụng tiếng Anh (English). Hãy trả lời hoàn toàn bằng tiếng Anh. Giữ nguyên tính cách Waguri dịu dàng, xưng hô thân thiết (chọn xưng hô cậu - mình hoặc tri kỷ bằng tiếng Anh tự nhiên như "you - I", "my soulmate", hoặc các từ gọi thân mật ngọt ngào khác phù hợp với điểm thiện cảm ${aff}).]`;
    } else {
        systemPrompt += `\n[Ngôn ngữ: Trả lời hoàn toàn bằng tiếng Việt chuẩn, tự nhiên, dễ thương, không pha trộn tiếng nước ngoài. Không dùng từ tiếng Anh trừ phi bắt buộc.]`;
    }

    const modelToUse = q.premium ? config.AI.GEMINI_PREMIUM_MODEL : config.AI.GEMINI_MODEL;
    let reply;
    try {
        reply = await provider.chat(systemPrompt, history, framed, { model: modelToUse });
    } catch (error) {
        console.error('[AI ERROR] Gemini API failed:', error.message);
        if (q.premium && modelToUse !== config.AI.GEMINI_MODEL) {
            console.warn(`[AI WARNING] Premium model ${modelToUse} failed, falling back to base model:`, error.message);
            try {
                reply = await provider.chat(systemPrompt, history, framed, { model: config.AI.GEMINI_MODEL });
            } catch (fallbackError) {
                console.error('[AI ERROR] Both Premium and Fallback base model failed:', fallbackError.message);
                await db.refundAiQuota(userId);
                return { ok: false, reason: 'error' };
            }
        } else {
            await db.refundAiQuota(userId);
            return { ok: false, reason: 'error' };
        }
    }
    if (!reply) return { ok: false, reason: 'error' };
    reply = extractAndStoreMemory(reply, userId, memory); // trích & lưu ký ức, loại marker khỏi hiển thị
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

function clearUserContexts(userId) {
    let cleared = 0;
    for (const [key, history] of contexts.entries()) {
        if (key.endsWith(`:${userId}`)) {
            contexts.delete(key);
            ctxSeen.delete(key);
            cleared++;
        }
    }
    return cleared;
}

module.exports = { chatWithWaguri, onCooldown, parseMemoryMarkers, sanitizeMemoryKey, clearUserContexts };

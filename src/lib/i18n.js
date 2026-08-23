// src/lib/i18n.js
// Trình quản lý dịch thuật đa ngôn ngữ (i18n) cho Waguri.
// Hỗ trợ nested keys, dynamic parameters substitution, và fallback an toàn.
const vi = require('../locales/vi.json');
const en = require('../locales/en.json');
const { withTimeout, ACK_LOOKUP_TIMEOUT } = require('./timeout');

const locales = { vi, en };

/**
 * Lấy ngôn ngữ phù hợp dựa trên locale của Discord hoặc cấu hình.
 * Hỗ trợ fallback về 'vi' nếu không được chỉ định hoặc không được hỗ trợ.
 */
function getLanguage(locale) {
    if (!locale) return 'vi';
    const clean = locale.toLowerCase().split('-')[0]; // en-US -> en
    return locales[clean] ? clean : 'vi';
}

/**
 * Hàm dịch chuỗi text theo khoá (key) và ngôn ngữ chỉ định.
 * @param {string} locale Ngôn ngữ của client (en-US, vi, en...) hoặc thiết lập.
 * @param {string} key Khoá dịch dạng 'common.no_energy'.
 * @param {object} params Các biến số động truyền vào chuỗi dịch.
 */
function t(locale, key, params = {}) {
    const langCode = getLanguage(locale);
    const lang = locales[langCode];

    // Tìm giá trị lồng nhau theo key (ví dụ: 'common.btn.confirm')
    const value = key.split('.').reduce((obj, k) => obj?.[k], lang);
    // Dùng `== null` (không phải `!value`) để một bản dịch rỗng "" hợp lệ không bị coi là thiếu.
    if (value == null) {
        // Fallback sang tiếng Việt nếu không có bản dịch tiếng Anh
        if (langCode !== 'vi') {
            const fallbackValue = key.split('.').reduce((obj, k) => obj?.[k], locales.vi);
            if (fallbackValue != null) {
                return substitute(fallbackValue, params);
            }
        }
        // Namespace DỮ LIỆU/TÊN THỰC THỂ ('items.*', mọi 'data.*', và 'titles.*' — danh hiệu
        // dùng CHÍNH id (chuỗi tiếng Việt) làm khoá, chỉ dịch nếu có) đều lấy tên gốc từ id/DB.
        // vi chưa có các key này -> trả undefined để call-site dùng fallback `|| id/tênDB` thay
        // vì lộ raw key (vd 'data.jobs.shipper.name' hay 'titles.Tân Thủ Ngọt Ngào'). Key khác
        // vẫn trả key để lộ chỗ thiếu dịch.
        if (key.startsWith('items.') || key.startsWith('data.') || key.startsWith('titles.')) return undefined;
        return key;
    }

    return substitute(value, params);
}

// --- Cache locale theo user (chống query Supabase KHÔNG cache trên đường ack của MỌI lệnh) ---
// getInteractionLanguage() chạy TRƯỚC command.execute() (interactionCreate.js). Trước đây nó luôn
// await db.getUser() (không cache) + có thể await db.getGuildSettings() — 1-2 RTT Supabase nối tiếp
// trên 100% traffic. Khi DB chập chờn, chuỗi này ăn hết 3s -> deferReply hết hạn -> "This interaction
// failed". Cache locale đã phân giải theo user 60s (staleness 60s cho ngôn ngữ là vô hại) + bọc mỗi
// lần đọc DB trong timeout 800ms để một lần treo tự rơi về locale do Discord cung cấp.
const LOCALE_CACHE_TTL = 60_000;
const LOCALE_CACHE_MAX = 20_000;
// Trần tra DB nay lấy từ `lib/timeout.js` để mọi lời gọi trên đường trước ack dùng CHUNG một
// con số. Trước đây nó là hằng riêng ở đây, nên `getJail`/`getUser` cùng đường không hưởng.
const DB_LOOKUP_TIMEOUT = ACK_LOOKUP_TIMEOUT;
const localeCache = new Map(); // `${userId}:${guildId}` -> { locale, exp }

// Key gồm CẢ guildId: khi user chưa đặt ngôn ngữ cá nhân, locale phụ thuộc server (bước 2/3), nên
// cache theo mỗi cặp (user, guild) để user vào 2 server khác ngôn ngữ không bị dính cache sai.
function localeCacheKey(userId, guildId) {
    return `${userId}:${guildId || 'dm'}`;
}

function localeCacheGet(userId, guildId) {
    const e = localeCache.get(localeCacheKey(userId, guildId));
    if (e && e.exp > Date.now()) return e.locale;
    if (e) localeCache.delete(localeCacheKey(userId, guildId));
    return null;
}

function localeCacheSet(userId, guildId, locale) {
    // Chống phình vô hạn: chạm trần thì xoá sạch (đơn giản, an toàn).
    if (localeCache.size >= LOCALE_CACHE_MAX) localeCache.clear();
    localeCache.set(localeCacheKey(userId, guildId), { locale, exp: Date.now() + LOCALE_CACHE_TTL });
}

/** Xoá MỌI entry cache locale của user (mọi guild) — gọi khi user đổi ngôn ngữ để cập nhật tức thì. */
function invalidateLocaleCache(userId) {
    if (!userId) return;
    const prefix = `${userId}:`;
    for (const key of localeCache.keys()) {
        if (key.startsWith(prefix)) localeCache.delete(key);
    }
}

/**
 * Phân giải ngôn ngữ phù hợp cho một interaction/message (có cache theo user).
 * @param {object} interaction - Command interaction hoặc đối tượng giả lập.
 * @returns {Promise<string>} - 'vi' hoặc 'en'
 */
async function getInteractionLanguage(interaction) {
    if (!interaction) return 'vi';

    const user = interaction.user || interaction.author;
    const userId = user?.id;
    const guildId = interaction.guildId;

    if (userId) {
        const cached = localeCacheGet(userId, guildId);
        if (cached) return cached;
    }

    const resolved = await resolveInteractionLanguage(interaction, userId);
    if (userId) localeCacheSet(userId, guildId, resolved);
    return resolved;
}

// Thứ tự ưu tiên: CHỦ ĐỘNG thắng NGẦM ĐỊNH; trong nhóm ngầm định, CÁ NHÂN thắng MÔI TRƯỜNG.
//   1. gs.language        — admin chủ động chạy `/config language` cho server này
//   2. u.locale           — ngôn ngữ đã học được của người dùng, lưu trong DB
//   3. interaction.locale — ngôn ngữ Discord của chính người dùng
//   4. guildLocale        — ngôn ngữ Discord của server (tín hiệu môi trường, yếu nhất)
//   5. 'vi'
//
// Bậc 3 và 4 trước đây ĐẢO NGƯỢC: `guildLocale` được xét trước nên người Việt trong server
// đặt tiếng Anh luôn bị bot nói tiếng Anh. Tệ hơn, bậc 3 là NƠI DUY NHẤT gọi
// `updateUserLocale()`; vì bậc 4 cũ luôn khớp trong server và `return` trước, bậc học ngôn
// ngữ KHÔNG BAO GIỜ chạy => `users.locale` vĩnh viễn rỗng. Hai lỗi khoá nhau, phải sửa cùng
// lúc với migration 0110 (cột `users.locale` chưa từng tồn tại trên DB).
async function resolveInteractionLanguage(interaction, userId) {
    const guildId = interaction.guildId;

    // Hai lần tra DB chạy SONG SONG, không nối tiếp.
    //
    // Trước 2026-08-23 chúng nối tiếp: `await getGuildSettings` rồi mới `await getUser`, mỗi
    // cái trần 800ms -> tối đa 1600ms TRƯỚC KHI execute() được gọi, tức trước cả deferReply.
    // Cộng vòng gọi mạng của defer thì chạm ngưỡng 3 giây của Discord, và lệnh chết câm với
    // "The application did not respond".
    //
    // Đã xảy ra thật: 23-08-2026, /trongcay ở guild 1533401930024353792 — cảnh báo ack nổ ở
    // 2500ms rồi deferReply ném 10062 Unknown interaction. Đọc mã thì trongcay vô can,
    // deferReply là DÒNG ĐẦU của execute; chậm nằm hết ở đây.
    //
    // Đệm locale chỉ sống 60 giây nên đường lạnh này KHÔNG hiếm — ai chơi cách nhau vài phút
    // là gặp lại. Chạy song song đưa trần xuống 800ms, trả lại 800ms cho ngân sách ack.
    //
    // Đổi lại: khi server đã đặt `gs.language` thì vẫn tốn thêm một lần đọc `getUser` mà bản
    // nối tiếp bỏ qua được. Đáng — một lần đọc DB rẻ hơn nhiều so với một lệnh chết câm.
    let gs = null;
    let u = null;
    if (guildId || userId) {
        const db = require('../database');
        const [rGs, rU] = await Promise.allSettled([
            guildId ? withTimeout(db.getGuildSettings(guildId), DB_LOOKUP_TIMEOUT) : Promise.resolve(null),
            userId ? withTimeout(db.getUser(userId), DB_LOOKUP_TIMEOUT) : Promise.resolve(null),
        ]);
        if (rGs.status === 'fulfilled') gs = rGs.value;
        else console.error('[i18n] Lỗi getGuildSettings:', rGs.reason?.message || rGs.reason);
        if (rU.status === 'fulfilled') u = rU.value;
        else console.error('[i18n] Lỗi getUser locale:', rU.reason?.message || rU.reason);
    }

    // 1. Cấu hình ngôn ngữ của server do admin đặt — vẫn thắng như cũ.
    if (gs?.language) return getLanguage(gs.language);

    // 2. Ngôn ngữ của người dùng đã ghi nhớ trong DB.
    //    Đây là nguồn DUY NHẤT cho đường prefix (`w!`): interaction giả do prefixShim dựng
    //    không có `locale` lẫn `guildLocale` từ Discord.
    if (u?.locale) return getLanguage(u.locale);

    // 3. Ngôn ngữ Discord của chính người dùng — và HỌC lại vào DB để lần sau
    //    (nhất là để lệnh prefix biết được, vì đường đó không có tín hiệu nào từ Discord).
    if (interaction.locale) {
        if (userId) {
            try {
                const db = require('../database');
                db.updateUserLocale(userId, interaction.locale).catch(() => {});
            } catch { /* ignore */ }
        }
        return getLanguage(interaction.locale);
    }

    // 4. Ngôn ngữ Discord của server — tín hiệu môi trường, chỉ dùng khi không biết gì về
    //    cá nhân người dùng.
    if (interaction.guildLocale) {
        return getLanguage(interaction.guildLocale);
    }

    // 5. Mặc định là tiếng Việt
    return 'vi';
}

// Dấu phụ tiếng Việt — chỉ tiếng Việt mới có tổ hợp này, nên có dấu là bằng chứng RẤT MẠNH,
// mạnh hơn hẳn `guild.preferredLocale`.
const DAU_TIENG_VIET = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i;

/**
 * Người này có đang VIẾT tiếng Việt không?
 *
 * VÌ SAO CẦN: đường @mention (messageCreate) KHÔNG có `interaction.locale` — đó là thứ chỉ
 * slash command mới có. Nên bậc 3 của getInteractionLanguage bị bỏ qua, bậc học ngôn ngữ
 * không bao giờ chạy, và quyết định rơi xuống bậc 4: `guild.preferredLocale`.
 *
 * Mà `preferredLocale` của Discord **mặc định là en-US cho gần như mọi server** (chỉ server
 * Community mới đổi được). Nó là giá trị mặc định vô nghĩa, không phải sở thích thật.
 *
 * Hậu quả đo được 2026-08-19: 298/306 người dùng có `users.locale` rỗng, nên gần như MỌI
 * thông điệp hệ thống trên đường @mention hiện ra tiếng Anh cho một cộng đồng nói tiếng Việt.
 * Lỗi bị che vì câu trả lời AI vẫn ra tiếng Việt — model bám theo ngôn ngữ người dùng viết,
 * bất kể chỉ thị trong prompt.
 *
 * Chỉ khẳng định theo chiều DƯƠNG: có dấu -> chắc chắn tiếng Việt. Không có dấu KHÔNG có
 * nghĩa là tiếng Anh (người Việt vẫn hay gõ không dấu), nên khi đó trả null để các bậc còn
 * lại tự quyết.
 */
function detectVietnamese(text) {
    return DAU_TIENG_VIET.test(String(text || '')) ? 'vi' : null;
}

function substitute(template, params) {
    if (typeof template !== 'string') return template;
    let result = template;
    Object.entries(params).forEach(([k, v]) => {
        result = result.replace(new RegExp(`{${k}}`, 'g'), v);
    });
    return result;
}

module.exports = { t, getLanguage, getInteractionLanguage, invalidateLocaleCache, detectVietnamese };

// src/lib/i18n.js
// Trình quản lý dịch thuật đa ngôn ngữ (i18n) cho Waguri.
// Hỗ trợ nested keys, dynamic parameters substitution, và fallback an toàn.
const vi = require('../locales/vi.json');
const en = require('../locales/en.json');

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
const DB_LOOKUP_TIMEOUT = 800;
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

// Trả về undefined nếu promise không kịp trong `ms` (rơi sang fallback kế tiếp), không ném lỗi.
function withTimeout(promise, ms) {
    let timer;
    const guard = new Promise((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
        if (typeof timer?.unref === 'function') timer.unref();
    });
    return Promise.race([
        Promise.resolve(promise).catch(() => undefined),
        guard,
    ]).finally(() => clearTimeout(timer));
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

async function resolveInteractionLanguage(interaction, userId) {
    // 1. Kiểm tra cấu hình ngôn ngữ của user trong DB (bọc timeout để không kẹt đường ack)
    if (userId) {
        try {
            const db = require('../database');
            const u = await withTimeout(db.getUser(userId), DB_LOOKUP_TIMEOUT);
            if (u?.locale) {
                return getLanguage(u.locale);
            }
        } catch (e) {
            console.error('[i18n] Lỗi getUser locale:', e);
        }
    }

    // 2. Kiểm tra cấu hình ngôn ngữ của server trong DB (nếu có guildId)
    const guildId = interaction.guildId;
    if (guildId) {
        try {
            const db = require('../database');
            const gs = await withTimeout(db.getGuildSettings(guildId), DB_LOOKUP_TIMEOUT);
            if (gs?.language) {
                return getLanguage(gs.language);
            }
        } catch (e) {
            console.error('[i18n] Lỗi getGuildSettings:', e);
        }
    }

    // 3. Kiểm tra locale của guild từ Discord (ngôn ngữ hiển thị của máy chủ)
    if (interaction.guildLocale) {
        return getLanguage(interaction.guildLocale);
    }

    // 4. Kiểm tra locale của user client từ Discord
    if (interaction.locale) {
        // Lưu lại locale của user client vào DB bất đồng bộ (fire-and-forget)
        if (userId) {
            try {
                const db = require('../database');
                db.updateUserLocale(userId, interaction.locale).catch(() => {});
            } catch { /* ignore */ }
        }
        return getLanguage(interaction.locale);
    }

    // 5. Mặc định là tiếng Việt
    return 'vi';
}

function substitute(template, params) {
    if (typeof template !== 'string') return template;
    let result = template;
    Object.entries(params).forEach(([k, v]) => {
        result = result.replace(new RegExp(`{${k}}`, 'g'), v);
    });
    return result;
}

module.exports = { t, getLanguage, getInteractionLanguage, invalidateLocaleCache };

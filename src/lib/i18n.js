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
    if (!value) {
        // Fallback sang tiếng Việt nếu không có bản dịch tiếng Anh
        if (langCode !== 'vi') {
            const fallbackValue = key.split('.').reduce((obj, k) => obj?.[k], locales.vi);
            if (fallbackValue) {
                return substitute(fallbackValue, params);
            }
        }
        // Namespace TÊN VẬT PHẨM: vi chưa có 'items'/'data.items' -> trả undefined để call-site
        // dùng fallback tên trong DB (tiếng Việt) thay vì hiện raw key 'items.go.name'.
        // Các key khác vẫn trả về key để lộ rõ chỗ thiếu dịch (không đổi hành vi cũ).
        if (key.startsWith('items.') || key.startsWith('data.items.')) return undefined;
        return key;
    }
    
    return substitute(value, params);
}

/**
 * Phân giải ngôn ngữ phù hợp cho một interaction/message (chạy bất đồng bộ từ DB).
 * @param {object} interaction - Command interaction hoặc đối tượng giả lập.
 * @returns {Promise<string>} - 'vi' hoặc 'en'
 */
async function getInteractionLanguage(interaction) {
    if (!interaction) return 'vi';
    
    const user = interaction.user || interaction.author;
    const userId = user?.id;
    
    // 1. Kiểm tra cấu hình ngôn ngữ của user trong DB
    if (userId) {
        try {
            const db = require('../database');
            const u = await db.getUser(userId);
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
            const gs = await db.getGuildSettings(guildId);
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

module.exports = { t, getLanguage, getInteractionLanguage };

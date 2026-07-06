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
        return key;
    }
    
    return substitute(value, params);
}

function substitute(template, params) {
    if (typeof template !== 'string') return template;
    let result = template;
    Object.entries(params).forEach(([k, v]) => {
        result = result.replace(new RegExp(`{${k}}`, 'g'), v);
    });
    return result;
}

module.exports = { t, getLanguage };

// lib/messages.js — Gom thông báo lỗi/cooldown lặp + định dạng thời gian chờ.
// Giọng điệu: Waguri (dễ thương, gọi "cậu", dùng "~").
const { t } = require('./i18n');

/** Định dạng cooldown dùng tag Discord relative timestamp. */
function formatCooldown(expiresAtMs) {
    return `<t:${Math.floor(expiresAtMs / 1000)}:R>`;
}

// === Thông báo chung (dùng lại ở nhiều command/event) ===
const MSG = {
    // Rate limit
    RATE_LIMITED: (locale) => t(locale, 'common.rate_limited'),

    // Ban
    BANNED: (locale) => t(locale, 'common.banned'),

    // Lỗi chung
    GENERIC_ERROR: (locale) => t(locale, 'common.generic_error'),
    RETRY_LATER: (locale) => t(locale, 'common.retry_later'),

    // Kho đồ
    NOT_ENOUGH_MONEY: (locale, cost, currency) => t(locale, 'common.insufficient_funds', { cost, currency }),
    ITEM_NOT_FOUND: (locale) => t(locale, 'common.item_not_found'),

    // Jail
    JAILED: (locale, reason, until) => {
        const timeStr = formatCooldown(until);
        if (reason) {
            return t(locale, 'common.jailed', { reason, time: timeStr });
        }
        return t(locale, 'common.jailed_no_reason', { time: timeStr });
    },
};

module.exports = { formatCooldown, MSG };

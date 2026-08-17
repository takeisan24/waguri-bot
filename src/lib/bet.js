const config = require('../config');
const { gamblingEnabled } = require('./guildflags');
const { t } = require('./i18n');

// Kiểm tra trước khi cho cược. Trả chuỗi lỗi (đã có giọng Waguri) hoặc null nếu OK.
// Truyền guildId để chặn khi server tắt trò may rủi (admin đặt qua /config hoặc web).
//
// `locale` mặc định 'vi' để lời gọi cũ (nếu còn sót) không vỡ, nhưng CẢ 8 lệnh trò chơi
// dùng hàm này đều đã truyền locale thật. Trước đây hàm trả thẳng câu tiếng Việt và 8 lệnh
// nhét nguyên văn vào embed, nên người dùng tiếng Anh đọc phải tiếng Việt ở mọi trò cược.
async function checkBet(bet, guildId, locale = 'vi') {
    if (guildId && !(await gamblingEnabled(guildId)))
        return t(locale, 'lib.bet.gambling_off');
    if (!bet) return t(locale, 'lib.bet.invalid_amount');
    if (bet < config.GAMBLE.MIN_BET) {
        return t(locale, 'lib.bet.min', {
            amount: config.GAMBLE.MIN_BET.toLocaleString(locale.startsWith('en') ? 'en-US' : 'vi-VN'),
            currency: config.CURRENCY,
        });
    }
    if (bet > config.GAMBLE.MAX_BET) {
        return t(locale, 'lib.bet.max', {
            amount: config.GAMBLE.MAX_BET.toLocaleString(locale.startsWith('en') ? 'en-US' : 'vi-VN'),
            currency: config.CURRENCY,
        });
    }
    return null;
}

module.exports = { checkBet };

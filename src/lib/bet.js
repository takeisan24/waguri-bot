const config = require('../config');
const { gamblingEnabled } = require('./guildflags');

// Kiểm tra trước khi cho cược. Trả chuỗi lỗi (đã có giọng Waguri) hoặc null nếu OK.
// Truyền guildId để chặn khi server tắt trò may rủi (admin đặt qua /config hoặc web).
async function checkBet(bet, guildId) {
    if (guildId && !(await gamblingEnabled(guildId)))
        return 'Máy chủ này đã **tắt trò may rủi** rồi nha~ Mình chơi hoạt động khác cho vui nhé 🌸';
    if (!bet) return 'Số tiền cược không hợp lệ~ (nhập số, hoặc `all`)';
    if (bet < config.GAMBLE.MIN_BET) return `Cược tối thiểu **${config.GAMBLE.MIN_BET}** ${config.CURRENCY} nhé~`;
    if (bet > config.GAMBLE.MAX_BET) return `Cược tối đa **${config.GAMBLE.MAX_BET.toLocaleString('vi-VN')}** ${config.CURRENCY} thôi~`;
    return null;
}

module.exports = { checkBet };

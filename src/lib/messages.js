// lib/messages.js — Gom thông báo lỗi/cooldown lặp + định dạng thời gian chờ.
// Giọng điệu: Waguri (dễ thương, gọi "cậu", dùng "~").

/** Định dạng cooldown dùng tag Discord relative timestamp. */
function formatCooldown(expiresAtMs) {
    return `<t:${Math.floor(expiresAtMs / 1000)}:R>`;
}

// === Thông báo chung (dùng lại ở nhiều command/event) ===
const MSG = {
    // Rate limit
    RATE_LIMITED: 'Cậu thao tác hơi nhanh rồi~ chờ vài giây nhé! 🌸',

    // Ban
    BANNED: 'Cậu đã bị chặn sử dụng bot~ Liên hệ admin nếu có nhầm lẫn nhé.',

    // Lỗi chung
    GENERIC_ERROR: 'Đã có lỗi xảy ra khi thực thi lệnh này! 🥺',
    RETRY_LATER: 'Ơ, có lỗi rồi, cậu thử lại sau nhé~ 🌸',

    // Kho đồ
    NOT_ENOUGH_MONEY: (cost, currency) => `Ví cậu không đủ **${cost}** ${currency} rồi~ 😟`,
    ITEM_NOT_FOUND: 'Mình không tìm thấy vật phẩm này~',

    // Jail
    JAILED: (reason, until) => {
        const base = 'Cậu chưa thể làm việc này khi đang bị giam đâu~';
        const reasonText = reason ? `\nLý do: **${reason}**` : '';
        return `${base}${reasonText}\nĐược thả ${formatCooldown(until)}. 🌸`;
    },
};

module.exports = { formatCooldown, MSG };

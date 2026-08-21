// ============================================================
// lib/prefixTen.js — Nguồn DUY NHẤT về các tên gõ tắt của đường prefix.
//
// VÌ SAO TÁCH RA: `PREFIX_ALIASES` trước đây là hằng riêng trong `messageCreate.js`, và
// `PIG_CMDS` / `PLANT_CMDS` nằm trong hai lib khác. Không nơi nào gom lại, nên `/help`
// KHÔNG THỂ nói cho người dùng biết chúng tồn tại.
//
// Audit 21-08-2026: 24 tên gõ tắt chạy được nhưng không xuất hiện ở bất cứ đâu trong
// `/help`. Công đã bỏ ra mà không thu lại được gì — người quen tay thì biết, người mới
// thì không có đường nào để biết.
//
// Nay `messageCreate` định tuyến bằng bảng này, `/help` đọc bảng tra ngược từ cùng bảng —
// nên danh sách hiện ra KHÔNG THỂ lệch với danh sách thật sự chạy được.
// ============================================================
const { PIG_CMDS } = require('./pig');
const { PLANT_CMDS } = require('./plant');

// Alias prefix cũ -> lệnh mới (giữ người quen tay không hụt lệnh sau khi đổi tên / gộp lệnh).
// Giá trị: chuỗi = đổi tên (w!ngu -> nghingoi); {cmd,sub} = chèn thêm MỘT token phía trước.
//
// Lưu ý về tên trường `sub`: nó chỉ là "token chèn thêm", KHÔNG bắt buộc phải là tên một
// subcommand. Với `/image` (không có sub, nhưng có option `category` với choices
// cat|dog|waifu) thì `w!cat` chèn token `cat` và nó rơi đúng vào option đó. Máy quét audit
// từng báo 8 alias này là "trỏ tới sub không tồn tại" — dương tính giả, chúng chạy đúng.
const PREFIX_ALIASES = {
    // 1. Ảnh
    cat: { cmd: 'image', sub: 'cat' },
    dog: { cmd: 'image', sub: 'dog' },
    waifu: { cmd: 'image', sub: 'waifu' },

    // 2. Tương tác
    hug: { cmd: 'action', sub: 'hug' },
    kiss: { cmd: 'action', sub: 'kiss' },
    pat: { cmd: 'action', sub: 'pat' },
    poke: { cmd: 'action', sub: 'poke' },
    slap: { cmd: 'action', sub: 'slap' },

    // 3. Hôn nhân
    marry: { cmd: 'couple', sub: 'marry' },
    divorce: { cmd: 'couple', sub: 'divorce' },
    relationship: { cmd: 'couple', sub: 'status' },

    // 4. Cửa hàng
    shop: { cmd: 'store', sub: 'list' },
    buy: { cmd: 'store', sub: 'buy' },
    sell: { cmd: 'store', sub: 'sell' },

    // 5. Tài chính & Ngân hàng
    balance: { cmd: 'bank', sub: 'balance' },
    bal: { cmd: 'bank', sub: 'balance' },
    deposit: { cmd: 'bank', sub: 'gui' },
    withdraw: { cmd: 'bank', sub: 'rut' },

    // 6. Bot
    ping: { cmd: 'bot', sub: 'ping' },
    about: { cmd: 'bot', sub: 'about' },
    support: { cmd: 'bot', sub: 'support' },
    invite: { cmd: 'bot', sub: 'invite' },

    // Giữ nguyên các alias cũ khác
    ngu: 'nghingoi',
    trano: { cmd: 'vay', sub: 'tra' },
    donno: { cmd: 'vay', sub: 'doi' },
    no: { cmd: 'vay', sub: 'so' },
};

// Tên prefix-only do handler riêng phục vụ, KHÔNG đi qua prefixShim.
// Khoá = tên lệnh slash tương ứng, để `/help <lệnh>` tra ra được.
const TEN_RIENG = {
    heo: [...PIG_CMDS],
    trongcay: [...PLANT_CMDS],
    loto: ['loto', 'so', 'ds', 'end'],
    bingo: ['bingo', 'mua', 'check', 'end'],
};
// `hvl` / `mck` CỐ Ý không liệt kê: easter egg, mất ý nghĩa nếu ghi vào tài liệu.

/**
 * Mọi cách gõ tắt dẫn tới một lệnh — để `/help <lệnh>` hiện mục "Gõ tắt".
 * @param {string} tenLenh tên lệnh slash
 * @returns {string[]} danh sách tên (chưa kèm tiền tố), đã bỏ trùng và sắp xếp
 */
function tenTatCua(tenLenh) {
    const ra = new Set(TEN_RIENG[tenLenh] || []);
    for (const [tat, dich] of Object.entries(PREFIX_ALIASES)) {
        const cmd = typeof dich === 'string' ? dich : dich.cmd;
        if (cmd !== tenLenh) continue;
        const sub = typeof dich === 'string' ? null : dich.sub;
        ra.add(sub ? `${tat}` : tat);
    }
    // Bỏ chính tên lệnh — nó đã hiện ở dòng chữ ký, nhắc lại là thừa.
    ra.delete(tenLenh);
    return [...ra].sort();
}

/** Có handler riêng nuốt tên này không (dùng để cảnh báo trong /help). */
function coHandlerRieng(tenLenh) {
    return Object.prototype.hasOwnProperty.call(TEN_RIENG, tenLenh);
}

module.exports = { PREFIX_ALIASES, TEN_RIENG, tenTatCua, coHandlerRieng };

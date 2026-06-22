// lib/paymatch.js — trích MÃ đơn Premium (WAGURI + 8 hex IN HOA) từ nội dung chuyển khoản.
// Ngân hàng/Casso có thể thêm tiền tố/hậu tố hoặc đổi hoa-thường -> chuẩn hoá rồi dò.
function extractPremiumCode(text) {
    const m = String(text || '').toUpperCase().match(/WAGURI[0-9A-F]{8}/);
    return m ? m[0] : null;
}

module.exports = { extractPremiumCode };

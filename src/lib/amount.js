// Parse số tiền người dùng nhập: "all", "1k", "2m", "1tr", "1ty", "50000".
// max = số dư hiện có (dùng cho "all"). Trả số nguyên dương, hoặc null nếu sai.
function parseAmount(raw, max = Infinity) {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase().replace(/[,_\s]/g, '');
    if (['all', 'hết', 'het', 'max', 'tatca', 'tấtcả'].includes(s)) {
        return Number.isFinite(max) && max > 0 ? Math.floor(max) : null;
    }
    const m = s.match(/^(\d+(?:\.\d+)?)(k|m|tr|b|ty)?$/);
    if (!m) return null;
    const mult = { k: 1e3, m: 1e6, tr: 1e6, b: 1e9, ty: 1e9 }[m[2]] || 1;
    const n = Math.floor(parseFloat(m[1]) * mult);
    // Number.isFinite: chặn chuỗi số cực dài -> parseFloat=Infinity lọt vào thao tác tiền.
    return Number.isFinite(n) && n > 0 ? n : null;
}

module.exports = { parseAmount };

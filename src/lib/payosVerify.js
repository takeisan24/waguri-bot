// lib/payosVerify.js — Xác thực chữ ký webhook PayOS (HMAC-SHA256 trên `data`).
// Tách riêng (không phụ thuộc DB/Discord) để test độc lập. Thuật toán theo SDK PayOS.
const crypto = require('node:crypto');

// Sắp xếp object theo key (alphabet) để dựng chuỗi ký ổn định.
function sortObjByKey(obj) {
    return Object.keys(obj).sort().reduce((o, k) => { o[k] = obj[k]; return o; }, {});
}

// Chuyển object đã sort thành chuỗi `k=v&k=v...` (array -> JSON đã sort, null/undefined -> rỗng).
function objToQueryStr(obj) {
    return Object.keys(obj).filter(k => obj[k] !== undefined).map(k => {
        let v = obj[k];
        if (v && Array.isArray(v)) v = JSON.stringify(v.map(sortObjByKey));
        if (v === null || v === undefined || v === 'undefined' || v === 'null') v = '';
        return `${k}=${v}`;
    }).join('&');
}

// So khớp chữ ký PayOS gửi tới (chống giả mạo webhook). Trả true nếu hợp lệ.
function verifyPayos(data, signature, checksumKey) {
    if (!data || !signature || !checksumKey) return false;
    try {
        const expected = crypto.createHmac('sha256', checksumKey)
            .update(objToQueryStr(sortObjByKey(data))).digest('hex');
        const a = Buffer.from(expected), b = Buffer.from(String(signature));
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch { return false; }
}

module.exports = { verifyPayos, objToQueryStr, sortObjByKey };

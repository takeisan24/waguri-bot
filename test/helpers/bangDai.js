// Mô phỏng CHÍNH XÁC bảng dải của supabase/migrations/0163_thu_nhap_ngay_ap_dai.sql
// (hàm nhan_thu_nhap_chu_dong, bước 3). Dùng BigInt với mẫu số chung 10 để "numeric chính xác,
// floor MỘT lần" — không dính sai số số thực.
//   khúc1 ×1,0 · khúc2 ×0,5 · khúc3 ×0,1 · khúc4 min(phần × 0,1 ; 400)
// nhân 10:  10·A + 5·B + C + min(D, 4000)   rồi chia nguyên cho 10 (số không âm -> floor).
const MOC_1 = 100000n;
const MOC_2 = 300000n;
const MOC_3 = 1000000n;
const SAN_X10 = 4000n; // 400 xu × 10

const min = (a, b) => (a < b ? a : b);
const max = (a, b) => (a > b ? a : b);

/** net_tinh cho lượt gross khi tổng gross đã nhận trong ngày là `truoc`. Trả BigInt. */
function netTinh(truoc, gross) {
    const t = BigInt(truoc);
    const c = t + BigInt(gross);
    const A = max(min(c, MOC_1) - t, 0n);
    const B = max(min(c, MOC_2) - max(t, MOC_1), 0n);
    const C = max(min(c, MOC_3) - max(t, MOC_2), 0n);
    const D = max(c - max(t, MOC_3), 0n);
    return (10n * A + 5n * B + C + min(D, SAN_X10)) / 10n;
}

module.exports = { netTinh };

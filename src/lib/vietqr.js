// lib/vietqr.js — dựng URL ảnh VietQR chuẩn quốc gia (img.vietqr.io) cho embed Discord.
//
// VÌ SAO BOT CẦN BẢN RIÊNG (web đã có `web/src/lib/premium.ts`): cả luồng ủng hộ nay chạy
// TRONG Discord. Đo được ngày 2026-08-21: 332 người chơi nhưng **đúng 1 lượt đăng nhập web**
// từ trước tới nay — tức là đặt QR sau một cánh cửa OAuth thì gần như không ai mở. Ảnh
// img.vietqr.io là PNG công khai nên `embed.setImage()` hiển thị thẳng, không cần rời Discord.
//
// Số tài khoản đọc từ env, DÙNG CHUNG TÊN BIẾN với web để hai bên không lệch nhau.
const ACC = () => process.env.VCB_ACCOUNT || '';
const BANK = () => process.env.VCB_BANK || 'VCB'; // mã ngắn 'VCB' hoặc BIN '970436'
const HOLDER = () => process.env.VCB_HOLDER || '';

/** Đã cấu hình đủ để hiện QR chưa? Thiếu -> call-site phải báo "chưa cấu hình", đừng hiện QR rỗng. */
function daCauHinh() {
    return Boolean(ACC());
}

/**
 * URL ảnh QR.
 * @param {string} memo Nội dung chuyển khoản (mã đơn WAGURI…) — thứ dùng để đối soát.
 * @param {number} [amount] Số tiền. BỎ TRỐNG/0 -> QR không ghim tiền, người ủng hộ tự điền.
 *   Đây là điểm khác biệt giữa hai lối: Premium ghim đúng giá gói, ủng hộ thì "bao nhiêu cũng quý".
 */
function vietqrUrl(memo, amount = 0) {
    const p = new URLSearchParams({ addInfo: String(memo || ''), accountName: HOLDER() });
    if (Number(amount) > 0) p.set('amount', String(Math.round(Number(amount))));
    return `https://img.vietqr.io/image/${BANK()}-${ACC()}-compact2.png?${p.toString()}`;
}

/** Thông tin ngân hàng dạng chữ — phòng khi ảnh QR không tải được (mạng yếu, chặn CDN). */
function thongTinNganHang() {
    return { account: ACC(), bank: 'Vietcombank', holder: HOLDER() };
}

module.exports = { vietqrUrl, daCauHinh, thongTinNganHang };

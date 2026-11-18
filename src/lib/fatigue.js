const config = require('../config');

// ============================================================
// lib/fatigue.js — Hệ số "mệt" suy ra TRỰC TIẾP từ tình trạng người chơi
// (năng lượng + sức khỏe), thay cho cách đếm số lần làm liên tiếp.
//   - Còn >= THRESHOLD (50%) cả năng lượng LẪN sức khỏe -> thu nhập 100%.
//   - Tụt dưới THRESHOLD -> thu nhập giảm tuyến tính, tối đa chỉ còn FLOOR.
//   - Lấy theo chỉ số TỆ HƠN giữa năng lượng và sức khỏe.
// Hàm thuần (không giữ state) -> dễ test, gắn liền tài nguyên người chơi.
// ============================================================

/** Hệ số theo 1 tỉ lệ 0..1 (năng lượng% hoặc sức khỏe%). */
function conditionFactor(ratio) {
    const { THRESHOLD, FLOOR } = config.FATIGUE;
    const r = Math.max(0, Math.min(1, Number(ratio) || 0));
    if (r >= THRESHOLD) return 1;
    return FLOOR + (1 - FLOOR) * (r / THRESHOLD); // 0 -> FLOOR, THRESHOLD -> 1.0
}

/** Hệ số thu nhập do mệt: CHỈ theo NĂNG LƯỢNG.
 * (Sức khỏe KHÔNG phạt thu nhập — nó chỉ là cổng chặn hành động; máu chỉ giảm khi có bệnh.)
 * Vẫn giữ tham số `health` để không phá chữ ký các nơi đang gọi.
 *
 * `payout` (tuỳ chọn, > 0): số tiền ngay trước khi nhân hệ số mệt. Có `payout` thì sàn mệt là
 * SỐ TUYỆT ĐỐI bị kẹp (Lớp C): san = min(payout × FLOOR, FLOOR_CAP);
 * payout_sau_met = san + (payout − san) × (r / THRESHOLD) khi r < THRESHOLD. Hàm trả HỆ SỐ HIỆU
 * DỤNG payout_sau_met / payout, nên `Math.round(payout × hệ_số)` ra đúng số tiền và
 * `1 − hệ_số` là % giảm THẬT (nghề cao có thể > 50%). Khi payout × FLOOR <= FLOOR_CAP (mọi
 * lượt /fish /mine /chop, nghề thấp) trả đúng `conditionFactor` như cũ, từng bit.
 * Không truyền `payout` -> hành vi cũ (tương thích ngược). Hàm thuần, không chạm DB. */
function conditionMultiplier(energy, health, maxEnergy = config.ENERGY.MAX, payout = undefined) {
    const ratio = Number(energy) / maxEnergy;
    const cu = conditionFactor(ratio);
    const p = Number(payout);
    if (payout === undefined || !(p > 0) || !Number.isFinite(p)) return cu;
    const { THRESHOLD, FLOOR, FLOOR_CAP } = config.FATIGUE;
    const san = Math.min(p * FLOOR, FLOOR_CAP);
    if (san >= p * FLOOR) return cu;            // chưa chạm trần: trùng công thức cũ
    const r = Math.max(0, Math.min(1, Number(ratio) || 0));
    if (r >= THRESHOLD) return 1;
    return (san + (p - san) * (r / THRESHOLD)) / p;
}

module.exports = { conditionMultiplier, conditionFactor };

-- ============================================================
-- 0061_job_rebalance.sql — Gỡ "nghề bị lấn át" (M7)
-- ------------------------------------------------------------
-- Trước: sinh_vien (Lv3, 150-400, risk 0.20) BỊ shipper (Lv3, 150-400, risk 0.15) lấn át hoàn toàn;
--        streamer (Lv10, 700-2500, risk 0.25) BỊ moi_gioi (Lv10, 800-3000, risk 0.20) lấn át.
-- Nay tạo ĐÁNH ĐỔI rõ ràng để mỗi nghề có lý do tồn tại:
--   - sinh_vien: AN TOÀN hơn nhưng LƯƠNG thấp hơn (120-350, risk 0.10) vs shipper (lương cao hơn, rủi hơn).
--   - streamer: RỦI RO cao nhưng TRẦN LƯƠNG cao nhất (700-3500, risk 0.25) vs moi_gioi (ổn định hơn).
-- (jobs seed thẳng trong project Supabase nên chỉnh bằng UPDATE; ghi lại ở migration để truy vết.)
-- ============================================================

update jobs set min_wage = 120, max_wage = 350, risk_rate = 0.10 where id = 'sinh_vien';
update jobs set min_wage = 700, max_wage = 3500, risk_rate = 0.25 where id = 'streamer';

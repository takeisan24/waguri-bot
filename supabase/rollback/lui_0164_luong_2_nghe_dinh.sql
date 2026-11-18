-- ============================================================
-- lui_0164_luong_2_nghe_dinh.sql — ĐƯỜNG LÙI của 0164 (Lớp D). KHÔNG phải migration.
--
-- File này cố ý nằm NGOÀI supabase/migrations/ để không ai áp nhầm theo thứ tự số.
-- Khi cần lùi: chép nguyên văn thành migration số kế tiếp, áp waguri-test rồi mới prod.
--
-- ⚠️ ĐIỀU KIỆN AN TOÀN (S1 #17 của spec): CHỈ lùi khi Lớp A đang chạy ở
--    `config.WORK.BAND_MODE = 'enforce'`. Trả lương `dai_gia` / `chu_tich` về mức cũ trong
--    lúc còn 'log' hoặc 'off' là MỞ LẠI NGUYÊN LỖ ở hai nghề đỉnh (mỗi lượt /work hàng
--    chục nghìn xu, không có dải nào giữ lại).
--
-- Trả về đúng số seed của 0043. Không chạm nghề khác, không chạm cột khác.
-- Idempotent (UPDATE đặt giá trị tuyệt đối).
-- ============================================================

UPDATE public.jobs SET min_wage = 20000, max_wage = 60000 WHERE id = 'dai_gia';
UPDATE public.jobs SET min_wage =  5000, max_wage = 20000 WHERE id = 'chu_tich';

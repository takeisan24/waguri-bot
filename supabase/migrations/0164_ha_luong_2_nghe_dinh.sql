-- ============================================================
-- 0164_ha_luong_2_nghe_dinh.sql — Lớp D: hạ lương hai nghề đỉnh
--
-- `dai_gia` 20.000–60.000 và `chu_tich` 5.000–20.000 (seed 0043) trả mỗi lượt `/work`
-- gấp hàng chục lần mọi nghề còn lại; đây là nơi phần lớn tiền dư được in ra. Hạ về mức
-- nối tiếp nghề `dev` (1.500–5.000):
--     chu_tich  2.500 –  7.000
--     dai_gia   4.000 – 11.000
-- Không chạm nghề nào khác, không chạm cột nào khác (cấp yêu cầu, xe, tỉ lệ rủi ro).
-- `/job` đọc lương từ bảng `jobs` nên tự hiện số mới.
--
-- Đường lùi: supabase/rollback/lui_0164_luong_2_nghe_dinh.sql (NGOÀI thư mục migrations) —
-- đọc điều kiện an toàn ở đầu file đó trước khi dùng.
--
-- Idempotent (UPDATE đặt giá trị tuyệt đối; chạy lại không đổi gì).
-- ============================================================

UPDATE public.jobs SET min_wage = 4000, max_wage = 11000 WHERE id = 'dai_gia';
UPDATE public.jobs SET min_wage = 2500, max_wage =  7000 WHERE id = 'chu_tich';

-- ============================================================
-- VERIFY:
--   SELECT id, min_wage, max_wage FROM public.jobs WHERE id IN ('dai_gia', 'chu_tich');
--     -> dai_gia 4000 / 11000 · chu_tich 2500 / 7000
-- ============================================================

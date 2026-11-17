-- ============================================================
-- 0167_xoa_bakery_collect_cu.sql — xoá hàm `bakery_collect` (bản cũ, 0066)
--
-- Đã có `bakery_collect_v2` (trừ lương, qua Lớp B). Bản cũ cộng thẳng `revenue` vào ví, không
-- trừ lương, không qua trần. Kiểm trước khi viết: 0 nơi gọi trong src/, web/, test/, scripts/;
-- không hàm SQL nào khác gọi nó. Wrapper JS `bakeryCollect` được gỡ cùng PR này.
--
-- THỨ TỰ: áp SAU CÙNG (sau 0166 và sau khi bot mã mới đã chạy). Nếu công cụ từ chối DROP:
-- để người dùng áp tay, không vòng qua đường khác.
-- Đường lùi: supabase/rollback/lui_0167_bakery_collect_cu.sql. Idempotent.
-- ============================================================

DROP FUNCTION IF EXISTS public.bakery_collect(text, integer, bigint, bigint);

-- Sau khi áp: select count(*) from pg_proc where proname = 'bakery_collect';   -- phải = 0

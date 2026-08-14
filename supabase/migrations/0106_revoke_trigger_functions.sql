-- ============================================================
-- 0106_revoke_trigger_functions.sql — Gỡ phơi nhiễm 2 hàm trigger của 0104
--
-- Supabase security advisor phát hiện ngay sau khi áp 0104:
--   log_money_change() và log_item_change() bị PostgREST phơi ra thành endpoint
--   /rest/v1/rpc/... cho anon + authenticated, vì chúng là SECURITY DEFINER mà
--   0104 QUÊN REVOKE (mọi hàm khác trong 0104 đều đã revoke — chỉ sót 2 cái này).
--
-- MỨC ĐỘ: thấp. Postgres từ chối gọi trigger function ngoài ngữ cảnh trigger
-- ("trigger functions can only be called as triggers"), nên không khai thác được.
-- Nhưng đây là phơi nhiễm thừa và nó làm advisor đỏ — gỡ cho sạch.
--
-- Bài học lặp lại: hardening bằng khối DO liệt kê tay thì hàm nào quên đưa vào
-- danh sách sẽ hở (giống hệt cách 0055 để lọt các hàm tạo sau nó).
--
-- Idempotent.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.log_money_change() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_item_change()  FROM public, anon, authenticated;

-- Trigger chạy bằng quyền chủ bảng nên KHÔNG cần cấp lại cho service_role;
-- cấp cho chắc để thao tác bảo trì thủ công vẫn gọi được.
GRANT EXECUTE ON FUNCTION public.log_money_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_item_change()  TO service_role;

-- ============================================================
-- VERIFY:
--   SELECT proname, proacl::text FROM pg_proc
--   WHERE proname IN ('log_money_change','log_item_change','purge_ledger_on_user_delete');
--     -> KHÔNG được còn anon/authenticated
--   Rồi chạy lại advisor: anon_security_definer_function_executable phải giảm 2.
--   Trigger vẫn phải hoạt động (nó chạy bằng quyền chủ bảng, không qua EXECUTE grant).
-- ============================================================

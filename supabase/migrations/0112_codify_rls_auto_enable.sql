-- ============================================================
-- 0112_codify_rls_auto_enable.sql — Đưa lá chắn RLS tự động vào phiên bản quản lý
--
-- PHÁT HIỆN 2026-08-14 (quét lệch prod↔test): prod có event trigger `ensure_rls` gọi
-- `public.rls_auto_enable()` — tự bật Row Level Security cho MỌI bảng mới tạo trong
-- schema `public`. Nhưng **KHÔNG file migration nào tạo nó**: `0054_security_harden.sql`
-- chỉ NHẮC tên hàm trong danh sách revoke, chứ không định nghĩa. Nó được tạo tay trên
-- prod.
--
-- Hệ quả nếu không sửa:
--   · Dựng lại DB từ đầu bằng migration -> MẤT lá chắn, bảng mới không có RLS
--   · DB test không có nó -> hành vi bảo mật khác prod, "diễn tập trên test" mất ý nghĩa
--     đúng ở khía cạnh dễ sai nhất
--
-- Đây là cùng một lớp lỗi với `0080_user_locale.sql` (file có mà chưa áp) và với hai
-- migration trùng số của sự cố chợ: **trạng thái DB thật khác trạng thái mà repo mô tả.**
--
-- Thân hàm dưới đây LẤY NGUYÊN từ prod (`pg_get_functiondef`), không viết lại, để tránh
-- đúng cái bẫy suýt mắc với `delete_user_data`: chép lại hàm từ trí nhớ rồi sai chi tiết.
--
-- Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public')
        AND cmd.schema_name NOT IN ('pg_catalog','information_schema')
        AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)',
                  cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Hàm chạy dưới quyền event trigger của hệ thống, không ai gọi trực tiếp -> khoá lại.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;

-- Event trigger: `CREATE EVENT TRIGGER` không có `IF NOT EXISTS`, nên phải tự kiểm.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
        CREATE EVENT TRIGGER ensure_rls
            ON ddl_command_end
            WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
            EXECUTE FUNCTION public.rls_auto_enable();
        RAISE NOTICE '0112: da tao event trigger ensure_rls';
    ELSE
        RAISE NOTICE '0112: event trigger ensure_rls da co san, bo qua';
    END IF;
END $$;

-- ============================================================
-- VERIFY (cả prod lẫn test):
--   SELECT evtname, evtevent FROM pg_event_trigger WHERE evtname = 'ensure_rls';
--   -> ensure_rls | ddl_command_end
--   Thử: CREATE TABLE public.zz_thu(id int);  ->  rồi kiểm relrowsecurity = true
--        DROP TABLE public.zz_thu;
-- ============================================================

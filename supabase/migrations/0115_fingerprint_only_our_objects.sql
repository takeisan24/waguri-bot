-- ============================================================
-- 0115_fingerprint_only_our_objects.sql — Thu hẹp vân tay về đúng object CỦA MÌNH
--
-- PHÁT HIỆN Ở LẦN CHẠY ĐẦU của gate `check-db-drift`: nó báo 2 độ lệch
-- `graphql_watch_ddl` và `graphql_watch_drop` — nhưng đó là event trigger của NỀN TẢNG
-- Supabase (extension `pg_graphql`), không phải của dự án. Chúng khác nhau giữa hai
-- project chỉ vì thời điểm/phiên bản provisioning, mình không tạo cũng không xoá được.
--
-- CÁCH SỬA SAI: thêm 2 tên đó vào một danh sách miễn trừ.
-- CÁCH SỬA ĐÚNG: định nghĩa lại cho chuẩn BỀ MẶT SO SÁNH. Gate chỉ nên gác thứ dự án
-- sở hữu. Đây là khác biệt quan trọng: miễn trừ là "biết sai mà cho qua", còn thu hẹp
-- phạm vi là "chưa bao giờ thuộc phạm vi".
--
-- Phân tách sạch, đã kiểm chứng: 9 event trigger trên prod thì 8 cái có hàm nằm ở schema
-- `extensions`/`graphql` (nền tảng), CHỈ `ensure_rls` có hàm ở `public` (của mình).
-- Các phần khác của vân tay vốn đã lọc `nspname = 'public'` rồi, chỉ event trigger là sót.
--
-- Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION public.schema_fingerprint()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT jsonb_build_object(
        'tables', (
            SELECT COALESCE(jsonb_object_agg(t.table_name, t.cols), '{}'::jsonb)
              FROM (
                SELECT c.table_name,
                       jsonb_agg(c.column_name || ':' || c.data_type ORDER BY c.column_name) AS cols
                  FROM information_schema.columns c
                  JOIN information_schema.tables tb
                    ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
                 WHERE c.table_schema = 'public' AND tb.table_type = 'BASE TABLE'
                 GROUP BY c.table_name
              ) t
        ),
        'functions', (
            SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) FROM (
                SELECT DISTINCT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS x
                  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public'
            ) s
        ),
        'definer_khong_ghim_search_path', (
            SELECT COALESCE(jsonb_agg(p.proname ORDER BY p.proname), '[]'::jsonb)
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.prosecdef
               AND NOT EXISTS (
                   SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
                    WHERE cfg LIKE 'search_path=%')
        ),
        'indexes', (
            SELECT COALESCE(jsonb_agg(indexname ORDER BY indexname), '[]'::jsonb)
              FROM pg_indexes WHERE schemaname = 'public'
        ),
        -- ĐỔI Ở ĐÂY: chỉ lấy event trigger có HÀM nằm trong schema `public`.
        -- Loại 8 trigger của nền tảng (extensions.*, graphql.*) khỏi bề mặt so sánh.
        'event_triggers', (
            SELECT COALESCE(jsonb_agg(et.evtname ORDER BY et.evtname), '[]'::jsonb)
              FROM pg_event_trigger et
              JOIN pg_proc p ON p.oid = et.evtfoid
              JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
        ),
        'bang_chua_bat_rls', (
            SELECT COALESCE(jsonb_agg(c.relname ORDER BY c.relname), '[]'::jsonb)
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
        )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.schema_fingerprint() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.schema_fingerprint() TO service_role;

-- ============================================================
-- VERIFY (cả prod lẫn test):
--   SELECT public.schema_fingerprint() -> 'event_triggers';
--   -> ["ensure_rls"]   (chỉ 1, không còn 8 cái của nền tảng)
-- ============================================================

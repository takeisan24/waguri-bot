-- ============================================================
-- 0113_schema_fingerprint.sql — Cho DB tự mô tả schema của chính nó
--
-- MỤC ĐÍCH: hai gate của Đợt 3 (`check-db-applied`, `check-db-drift`) cần đọc catalog
-- (danh sách bảng/cột/hàm/index/event trigger). Nhưng `@supabase/supabase-js` đi qua
-- PostgREST, mà PostgREST KHÔNG phơi `information_schema` / `pg_catalog`. Thêm thư viện
-- Postgres thuần chỉ để đọc catalog là thêm phụ thuộc cho một việc rất nhỏ.
--
-- => Để DB tự trả lời bằng MỘT lời gọi RPC. Gate chỉ cần `supabase.rpc('schema_fingerprint')`.
--
-- CHỈ TRẢ VỀ CẤU TRÚC, KHÔNG TRẢ VỀ DỮ LIỆU. Không đọc một hàng nào của bảng nào.
-- Kết quả đem commit vào repo (`supabase/schema-snapshot.json`) — an toàn vì 122 file
-- migration vốn đã công khai trên GitHub, tên bảng/cột/hàm không phải bí mật.
--
-- Chỉ `service_role` gọi được, như mọi RPC nhạy cảm khác.
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
        -- Bảng -> danh sách "cột:kiểu" đã sắp xếp. Có kiểu để bắt được cả trôi KIỂU DỮ LIỆU,
        -- không chỉ trôi tên cột.
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
        -- Hàm -> "tên(tham số)". Kèm chữ ký để phân biệt hàm nạp chồng.
        'functions', (
            SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) FROM (
                SELECT DISTINCT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS x
                  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public'
            ) s
        ),
        -- Hàm SECURITY DEFINER CHƯA ghim search_path — thuộc tính bảo mật, không chỉ là cấu trúc.
        -- Đưa vào ảnh chụp để ai đó tạo hàm hở thẳng trên prod là gate phát hiện được.
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
        'event_triggers', (
            SELECT COALESCE(jsonb_agg(evtname ORDER BY evtname), '[]'::jsonb) FROM pg_event_trigger
        ),
        -- Bảng CHƯA bật RLS — cũng là thuộc tính bảo mật đáng gác.
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
-- VERIFY:
--   SELECT jsonb_pretty(public.schema_fingerprint() -> 'event_triggers');
--   SELECT jsonb_object_keys(public.schema_fingerprint());
--   -> tables, functions, definer_khong_ghim_search_path, indexes, event_triggers,
--      bang_chua_bat_rls
-- ============================================================

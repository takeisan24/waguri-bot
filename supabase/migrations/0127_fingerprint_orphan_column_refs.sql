-- ============================================================
-- 0127 — Vân tay schema báo thêm HÀM GHI VÀO CỘT KHÔNG TỒN TẠI.
--
-- VÌ SAO CÓ: gate 0123 chỉ soi tên BẢNG. Nhưng lớp lỗi tệ nhất của dự án này lại là sai tên
-- CỘT:
--   · `0094` study RPC ghi vào cột `coins` không tồn tại -> báo THÀNH CÔNG GIẢ, xếp CRITICAL
--   · `lottery_buy` ghi `lottery_state.pool` và `lottery_tickets.tickets` — cả hai không tồn
--     tại (tìm ra 2026-08-19, đã xoá ở 0126)
--
-- Postgres không kiểm tên cột trong thân hàm plpgsql, y như với tên bảng: `CREATE FUNCTION`
-- nhận tất, lỗi chỉ nổ lúc CHẠY. Và `ALTER TABLE ... DROP COLUMN` không hề đụng tới hàm đang
-- dùng cột đó.
--
-- PHẠM VI CÓ CHỦ Ý — chỉ soi hai khuôn GHI, độ chính xác cao:
--     UPDATE <bảng> SET <cột> = ...
--     INSERT INTO <bảng> (<cột>, ...)
-- KHÔNG soi `SELECT <cột> FROM ...`: ở đó cột hay đi kèm bí danh bảng, JOIN, truy vấn con —
-- dò bằng regex sẽ đầy báo nhầm, mà một gate hay báo nhầm thì sớm muộn bị bỏ qua.
--
-- Hai khuôn này cũng là nơi thiệt hại lớn nhất: ghi sai cột nghĩa là dữ liệu KHÔNG được lưu
-- (hoặc lỗi giữa chừng transaction), còn đọc sai cột thường chỉ ra giá trị rỗng.
--
-- Đo trên 149 hàm prod (trước khi xoá lottery): đúng 2 phát hiện, cả hai đều THẬT, 0 báo nhầm.
-- ============================================================

create or replace function public.schema_fingerprint()
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
    WITH ham AS (
        SELECT p.proname,
               regexp_replace(
                   regexp_replace(pg_get_functiondef(p.oid), '/\*.*?\*/', ' ', 'g'),
                   '--[^\n]*', ' ', 'g') AS def
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prokind = 'f'
    ),
    cte AS (
        SELECT h.proname, lower(m[1]) AS ten
          FROM ham h, LATERAL regexp_matches(h.def,
               '(?:\mwith|,|\))\s*,?\s*([a-z_][a-z0-9_]*)\s+as\s*\(', 'gi') m
    ),
    tham_chieu AS (
        SELECT h.proname, lower(m[1]) AS phan1, lower(m[2]) AS phan2, m[3] AS mo_ngoac
          FROM ham h, LATERAL regexp_matches(h.def,
               '(?:\mfrom|\mjoin|\mupdate|\mdelete\s+from|\minsert\s+into)\s+(?:only\s+)?([a-z_][a-z0-9_]*)(?:\.([a-z_][a-z0-9_]*))?(\s*\()?',
               'gi') m
    ),
    mo_coi AS (
        SELECT DISTINCT t.proname || ' -> ' || coalesce(t.phan2, t.phan1) AS x
          FROM tham_chieu t
         WHERE t.mo_ngoac IS NULL
           AND t.phan1 NOT IN ('new', 'old')
           AND to_regclass(CASE WHEN t.phan2 IS NULL THEN t.phan1 ELSE t.phan1 || '.' || t.phan2 END) IS NULL
           AND to_regclass('public.' || coalesce(t.phan2, t.phan1)) IS NULL
           AND coalesce(t.phan2, t.phan1) NOT IN ('set', 'loop', 'now', 'values', 'only')
           AND coalesce(t.phan2, t.phan1) NOT LIKE 'v\_%'
           AND NOT EXISTS (SELECT 1 FROM cte c
                            WHERE c.proname = t.proname AND c.ten = coalesce(t.phan2, t.phan1))
    ),
    -- MỚI Ở 0127: cột bị GHI vào mà không tồn tại.
    cot_update AS (
        SELECT h.proname, lower(m[1]) AS bang, lower(m[2]) AS cot
          FROM ham h, LATERAL regexp_matches(h.def,
               '\mupdate\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+set\s+([a-z_][a-z0-9_]*)\s*=', 'gi') m
    ),
    cot_insert AS (
        SELECT i.proname, i.bang, trim(unnest(string_to_array(i.ds, ','))) AS cot
          FROM (
            SELECT h.proname, lower(m[1]) AS bang, lower(m[2]) AS ds
              FROM ham h, LATERAL regexp_matches(h.def,
                   '\minsert\s+into\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([^)]+)\)', 'gi') m
          ) i
    ),
    cot_mo_coi AS (
        SELECT DISTINCT c.proname || ' -> ' || c.bang || '.' || c.cot AS x
          FROM (SELECT * FROM cot_update UNION ALL SELECT * FROM cot_insert) c
         WHERE to_regclass('public.' || c.bang) IS NOT NULL   -- bảng ma đã có nhánh riêng lo
           AND c.cot ~ '^[a-z_][a-z0-9_]*$'
           AND NOT EXISTS (
               SELECT 1 FROM information_schema.columns ic
                WHERE ic.table_schema = 'public' AND ic.table_name = c.bang AND ic.column_name = c.cot)
    )
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
        ),
        'rang_buoc_trung', (
            SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) FROM (
                SELECT t.relname || ': ' || d.ten || ' -> ' || d.dinh_nghia AS x
                  FROM (
                        SELECT c.conrelid,
                               pg_get_constraintdef(c.oid) AS dinh_nghia,
                               string_agg(c.conname, ' = ' ORDER BY c.conname) AS ten
                          FROM pg_constraint c
                          JOIN pg_class ct ON ct.oid = c.conrelid
                          JOIN pg_namespace cn ON cn.oid = ct.relnamespace
                         WHERE cn.nspname = 'public' AND ct.relkind = 'r'
                         GROUP BY c.conrelid, pg_get_constraintdef(c.oid)
                        HAVING count(*) > 1
                       ) d
                  JOIN pg_class t ON t.oid = d.conrelid
            ) s
        ),
        'ham_goi_bang_khong_ton_tai', (
            SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) FROM mo_coi
        ),
        'ham_ghi_cot_khong_ton_tai', (
            SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) FROM cot_mo_coi
        )
    );
$function$;

revoke all on function public.schema_fingerprint() from public, anon, authenticated;
grant execute on function public.schema_fingerprint() to service_role;

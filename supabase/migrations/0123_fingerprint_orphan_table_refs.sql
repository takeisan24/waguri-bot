-- ============================================================
-- 0123 — Vân tay schema báo thêm HÀM GỌI BẢNG KHÔNG TỒN TẠI.
--
-- VÌ SAO CÓ: 0122 vừa phải sửa `feed_pet_with_fee` vì nó gọi bảng `pets` trong khi bảng thật
-- tên `user_pets` — `/pet feed food:money` CHƯA TỪNG chạy được, người chơi luôn nhận "lỗi hệ
-- thống". Cùng migration đó phải xoá `xoso_bet`/`xoso_resolve`, hai hàm mồ côi từ khi
-- `0037_ticket_lottery.sql` drop bảng `xoso_bets`/`xoso_results`.
--
-- Cả hai cùng một lớp lỗi: **Postgres không kiểm tra tên bảng bên trong thân hàm plpgsql**.
-- `CREATE FUNCTION` nhận mọi tên; lỗi chỉ nổ lúc CHẠY. Và `DROP TABLE ... CASCADE` cũng
-- không đụng tới hàm tham chiếu bảng đó, vì phụ thuộc trong thân hàm không được ghi vào
-- `pg_depend`. Nghĩa là đổi tên hoặc xoá một bảng có thể lặng lẽ làm hỏng hàm bất kỳ, và
-- không cổng nào của dự án nhìn thấy — `check-db-applied` chỉ hỏi "object có tồn tại không",
-- không hỏi "object đó có gọi thứ gì đã biến mất không".
--
-- Cách bịt: để DB tự quét thân mọi hàm, lấy tên đứng sau FROM/JOIN/UPDATE/DELETE FROM/
-- INSERT INTO, rồi báo tên nào không phân giải được thành quan hệ. `check-db-drift` bắt danh
-- sách này phải rỗng, cùng hạng với `bang_chua_bat_rls` và `rang_buoc_trung`.
--
-- ĐỘ CHÍNH XÁC (đã đo trên prod, 149 hàm): 0 báo nhầm. Đạt được nhờ bốn bộ lọc, mỗi cái
-- ứng với một nguồn nhiễu có thật đã gặp khi hiệu chỉnh:
--   1. Bỏ bình luận trước khi quét. Không bỏ thì câu tiếng Việt "…giữ FOR UPDATE nên về lý
--      thuyết" bị đọc thành `update n` (ký tự `ê` cắt token) — đúng một ca đã xảy ra.
--   2. Bỏ tên có dấu `(` theo sau: đó là hàm trả bảng (`unnest(`, `jsonb_each_text(`).
--   3. Bỏ `NEW.`/`OLD.`: `x is distinct from NEW.wallet` trông y hệt `from <bảng>`.
--   4. Bỏ tên CTE tự khai trong chính hàm đó, và biến plpgsql theo quy ước `v_` của dự án
--      (`select … into v_x` không dính vì ta không bắt `into` trần).
--
-- Nếu về sau có báo nhầm mới, SỬA BỘ LỌC ở đây chứ đừng lập danh sách miễn trừ: danh sách
-- miễn trừ sẽ nuốt luôn lỗi thật lần sau.
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
        -- MỚI Ở 0123
        'ham_goi_bang_khong_ton_tai', (
            SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) FROM mo_coi
        )
    );
$function$;

revoke all on function public.schema_fingerprint() from public, anon, authenticated;
grant execute on function public.schema_fingerprint() to service_role;

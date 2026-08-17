-- ============================================================
-- 0121 — Vân tay schema báo thêm RÀNG BUỘC TRÙNG ĐỊNH NGHĨA.
--
-- VÌ SAO CÓ: 0120 vừa phải bỏ tay một ràng buộc UNIQUE (user_id, item_id) bị nhân đôi trên
-- `inventory`. Nó sống sót gần hai năm vì không cổng nào nhìn thấy: ảnh chụp schema chỉ lưu
-- TÊN index (`indexes`), mà hai bản trùng có tên khác nhau nên trông như hai thứ khác nhau.
--
-- Gốc rễ là một khuôn viết migration rất dễ lặp lại:
--     if not exists (select 1 from pg_constraint where conname = 'ten_toi_dat') then
--         alter table X add constraint ten_toi_dat unique (a, b);
--     end if;
-- Nó hỏi "đã có ràng buộc TÊN NÀY chưa", chứ không hỏi "đã có ràng buộc CÙNG CỘT chưa".
-- Khi ràng buộc tương đương đã tồn tại dưới tên tự sinh (`X_a_b_key`), điều kiện luôn đúng
-- và bản trùng luôn được tạo. Cái giá: mỗi lần ghi bảng phải cập nhật hai cây B-tree y hệt.
--
-- Cách bịt: để DB tự khai báo mọi cặp ràng buộc CÙNG BẢNG + CÙNG ĐỊNH NGHĨA. `check-db-drift`
-- coi danh sách này phải rỗng, y như `bang_chua_bat_rls` và `definer_khong_ghim_search_path`.
-- Lần sau ai viết lại khuôn trên thì gate chặn ngay ở pre-push, không cần ai nhớ.
--
-- Giữ nguyên phần còn lại của hàm (0113/0115) — chỉ THÊM một khoá.
-- ============================================================

create or replace function public.schema_fingerprint()
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
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
        -- MỚI Ở 0121: các ràng buộc cùng bảng có định nghĩa giống hệt nhau.
        -- Mỗi phần tử đọc được ngay: "inventory: a = b -> UNIQUE (user_id, item_id)".
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
        )
    );
$function$;

-- Giữ nguyên chính sách quyền của 0113: chỉ service_role gọi được.
revoke all on function public.schema_fingerprint() from public, anon, authenticated;
grant execute on function public.schema_fingerprint() to service_role;

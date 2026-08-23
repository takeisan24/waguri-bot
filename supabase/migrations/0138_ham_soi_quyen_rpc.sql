-- ============================================================
-- 0138_ham_soi_quyen_rpc.sql — Cho cổng CI hỏi thẳng DB: còn RPC ghi nào mở cho anon không?
--
-- VÌ SAO KHÔNG SỬA `schema_fingerprint()`: hàm đó dài ~130 dòng SQL. Chép lại toàn bộ chỉ
-- để chèn một khoá là cách hỏng thứ hai đang chờ sẵn (đúng vết xe của vụ viết lại
-- `delete_user_data` từ trí nhớ rồi sai 3 chi tiết). Hàm riêng, nhỏ, không đụng hàm cũ.
--
-- VÌ SAO PHẢI HỎI DB CHỨ KHÔNG QUÉT FILE: `check-sql-policy.js` tìm chữ `GRANT ... TO anon`
-- trong migration. Lỗ hổng ở 0137 KHÔNG có dòng GRANT nào — Postgres mặc định cho PUBLIC
-- quyền EXECUTE trên mọi hàm mới. Không văn bản nào để mà quét. Chỉ DB mới biết sự thật.
-- ============================================================

create or replace function public.rpc_mo_cho_anon()
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
    -- Trả về các hàm CÓ GHI dữ liệu mà `anon` hoặc `authenticated` còn gọi được.
    -- Danh sách này PHẢI rỗng. Mỗi phần tử là một đường cướp tiền/phá dữ liệu mở sẵn
    -- cho bất kỳ ai đọc mã nguồn trang web (khoá anon nằm trong bundle trình duyệt).
    select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
    from (
        select distinct p.oid::regprocedure::text as x
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.prokind = 'f'
           and pg_get_functiondef(p.oid) ~* '\m(insert|update|delete)\M'
           and (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    ) s;
$$;

revoke execute on function public.rpc_mo_cho_anon() from public, anon, authenticated;
grant  execute on function public.rpc_mo_cho_anon() to service_role;

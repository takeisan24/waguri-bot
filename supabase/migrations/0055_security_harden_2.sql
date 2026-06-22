-- ============================================================
-- 0055_security_harden_2.sql — Hardening tiếp: pin search_path + gỡ phơi nhiễm GraphQL.
-- ------------------------------------------------------------
-- (A) function_search_path_mutable (77): mỗi hàm chưa cố định search_path -> SECURITY
--     DEFINER có thể bị hijack qua search_path của caller. Pin về 'pg_catalog, public'
--     (KHÔNG dùng '' vì các hàm tham chiếu bảng public không qualify -> sẽ gãy).
-- (B) pg_graphql_*_exposed (40): bảng lộ trong GraphQL/PostgREST cho anon/authenticated.
--     RLS đã chặn ROWS, nhưng revoke GRANT để gỡ hẳn khỏi schema (defense-in-depth).
--     AN TOÀN: web đọc/ghi game qua service_role (admin client); anon/authenticated chỉ
--     dùng cho auth (schema auth, không đụng bảng public) -> không hỏng.
-- ============================================================

-- ---------- (A) Pin search_path cho MỌI hàm trong schema public ----------
do $$
declare r record;
begin
    for r in
        select p.oid::regprocedure::text as sig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
    loop
        execute format('alter function %s set search_path = pg_catalog, public', r.sig);
    end loop;
end $$;

-- ---------- (B) Revoke quyền bảng khỏi anon/authenticated ----------
do $$
declare r record;
begin
    for r in select tablename from pg_tables where schemaname = 'public' loop
        execute format('revoke all on table public.%I from anon, authenticated', r.tablename);
    end loop;
end $$;

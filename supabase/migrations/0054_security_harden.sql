-- ============================================================
-- 0054_security_harden.sql — Vá bảo mật: khoá RPC premium + tái lập RLS.
-- ------------------------------------------------------------
-- PHÁT HIỆN (Supabase security advisor):
--   • 🔴 4 hàm premium là SECURITY DEFINER nhưng anon/authenticated GỌI ĐƯỢC qua
--     /rest/v1/rpc/... bằng public anon key -> tự duyệt/kích hoạt Premium KHÔNG
--     thanh toán (thất thu). approve_premium_order / redeem_premium_order /
--     redeem_premium_order_by_id / create_premium_order.
--   • rls_auto_enable() cũng đang lộ cho anon.
--   • RLS đã bật trên DB production (bật tay) nhưng KHÔNG có trong migration ->
--     rebuild từ đầu sẽ mất. Phần dưới tái lập (idempotent).
--
-- AN TOÀN: Bot (service_role) và web (admin client service-role) gọi các hàm này
-- qua service_role -> VẪN chạy. Chỉ chặn anon/authenticated/PUBLIC.
--
-- ROLLBACK: GRANT EXECUTE ON FUNCTION ... TO anon, authenticated;  (không khuyến nghị)
-- ============================================================

-- ---------- 1) Khoá EXECUTE các RPC nhạy cảm khỏi anon/authenticated/PUBLIC ----------
-- Revoke khỏi PUBLIC (anon & authenticated kế thừa từ PUBLIC) rồi cấp lại cho service_role.
do $$
declare
    fn text;
    sigs text[] := array[
        'public.approve_premium_order(text, text)',
        'public.create_premium_order(text, text, integer, integer)',
        'public.redeem_premium_order(text, integer, text)',
        'public.redeem_premium_order_by_id(bigint, integer, text)',
        'public.rls_auto_enable()'
    ];
begin
    foreach fn in array sigs loop
        if to_regprocedure(fn) is not null then
            execute format('revoke execute on function %s from public, anon, authenticated', fn);
            execute format('grant execute on function %s to service_role', fn);
        end if;
    end loop;
end $$;

-- ---------- 2) Tái lập RLS trên mọi bảng public (idempotent, không lỗi nếu đã bật) ----------
do $$
declare r record;
begin
    for r in select tablename from pg_tables where schemaname = 'public' loop
        execute format('alter table public.%I enable row level security', r.tablename);
    end loop;
end $$;

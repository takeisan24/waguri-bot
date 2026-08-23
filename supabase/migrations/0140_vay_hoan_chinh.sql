-- ============================================================
-- 0140_vay_hoan_chinh.sql — Phần HẬU QUẢ của hệ thống vay, thứ trước nay không có
--
-- SỐ LIỆU DẪN TỚI THAY ĐỔI NÀY (prod, 2026-08-24): 2 khoản vay · 0 khoản được trả · cả hai
-- quá hạn 58 ngày · tỉ lệ quỵt 100%. Nợ quá hạn KHÔNG sinh thêm gì nên nợ ngày 58 bằng
-- đúng nợ ngày 1 — người vay không có lý do nào để trả. Chủ nợ bỏ ra 10.500 để thu về
-- 11.000 mà gánh toàn bộ rủi ro mất trắng.
--
-- Ba hàm dưới đây đóng ba lỗ: nợ trễ phình dần (có trần), quỵt thì mất quyền vay tiếp,
-- và việc thu chạy nền thay vì bắt chủ nợ tự canh.
-- ============================================================

-- ── 1. Lãi phạt quá hạn ─────────────────────────────────────────────────────────────
-- Tính theo MỐC THỜI GIAN, không cộng dồn theo số lần chạy: chỉ phạt số ngày TRỌN chưa
-- phạt, rồi đẩy `late_through` lên đúng bấy nhiêu ngày. Gọi 1 lần hay 10 lần trong ngày
-- đều ra cùng kết quả, nên nhịp 12h của runEconomySnapshot không làm sai số tiền.
create or replace function public.loan_apply_late_fees(
    p_rate numeric default 0.02, p_max_mult numeric default 1.5)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare rec record; v_days int; v_add bigint; v_room bigint;
        v_n int := 0; v_tong bigint := 0;
begin
    if p_rate < 0 or p_rate > 1 then return jsonb_build_object('status','bad_rate'); end if;
    if p_max_mult < 1 then return jsonb_build_object('status','bad_mult'); end if;

    perform set_config('app.ledger_source', 'lai_phat_vay', true);

    for rec in
        select id, due_amount, late_total, greatest(due_at, late_through) as tu
          from loans
         where status = 'active' and due_at <= now()
         for update
    loop
        v_days := floor(extract(epoch from (now() - rec.tu)) / 86400)::int;
        continue when v_days <= 0;

        -- Trần BẮT BUỘC. Không có trần thì nợ phình vô hạn, người vay bỏ luôn tài khoản,
        -- và chủ nợ cũng mất trắng — đúng thứ đang cố tránh.
        v_room := floor(rec.due_amount * (p_max_mult - 1)) - rec.late_total;
        v_add  := least(floor(rec.due_amount * p_rate * v_days), greatest(v_room, 0));

        -- Vẫn phải đẩy mốc dù không phạt thêm (đã đụng trần), nếu không thì mỗi lượt chạy
        -- lại tính lại từng ấy ngày một cách vô ích.
        update loans
           set remaining    = remaining + v_add,
               late_total   = late_total + v_add,
               late_through = rec.tu + make_interval(days => v_days)
         where id = rec.id;

        if v_add > 0 then v_n := v_n + 1; v_tong := v_tong + v_add; end if;
    end loop;

    return jsonb_build_object('status','ok','so_khoan', v_n, 'tong_phat', v_tong);
end; $function$;

-- ── 2. Tự thu nợ quá hạn ────────────────────────────────────────────────────────────
-- Gọi lại `loan_collect` cho từng cặp chủ nợ–con nợ thay vì chép logic thanh toán. Bản
-- gốc đã đúng (khoá dòng, thu một phần chứ không thu quá, trả nợ cũ trước) nên chép lại
-- chỉ tạo ra một bản thứ hai để sai lệch dần.
create or replace function public.loan_collect_all()
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare rec record; r jsonb; v_n int := 0; v_tong bigint := 0;
begin
    perform set_config('app.ledger_source', 'tu_thu_no', true);
    for rec in
        select distinct lender_id, borrower_id
          from loans
         where status = 'active' and due_at <= now()
    loop
        r := public.loan_collect(rec.lender_id, rec.borrower_id);
        if r->>'status' = 'ok' then
            v_n := v_n + 1;
            v_tong := v_tong + coalesce((r->>'collected')::bigint, 0);
        end if;
    end loop;
    return jsonb_build_object('status','ok','so_lan_thu', v_n, 'tong_thu', v_tong);
end; $function$;

-- ── 3. Hồ sơ tín dụng ───────────────────────────────────────────────────────────────
-- Để CHỦ NỢ thấy được người vay từng quỵt hay chưa, ngay trên màn hình đề nghị — đúng
-- lúc họ quyết định. Dữ liệu vốn đã có, chỉ là chưa ai đưa ra trước mặt người cần nó.
create or replace function public.loan_credit(p_user text)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public'
as $function$
    select jsonb_build_object(
        'da_tra',      count(*) filter (where status = 'paid'),
        'dang_no',     count(*) filter (where status = 'active'),
        'qua_han',     count(*) filter (where status = 'active' and due_at <= now()),
        'no_qua_han',  coalesce(sum(remaining) filter (where status = 'active' and due_at <= now()), 0)
    )
    from loans where borrower_id = p_user;
$function$;

-- ── 4. Chặn vay mới khi đang có nợ quá hạn ──────────────────────────────────────────
-- Không có chốt này thì người quỵt xong đi vay tiếp của người khác, không dấu vết gì.
-- Kiểm ĐẶT TRƯỚC mọi thao tác tiền để không phải hoàn tác gì khi từ chối.
create or replace function public.loan_create(
    p_lender text, p_borrower text, p_principal bigint,
    p_interest numeric, p_days integer, p_fee_pct numeric default 0.05)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare v_upd int; v_due bigint; v_id bigint; v_when timestamptz; v_fee bigint; v_qh bigint;
begin
    if p_principal <= 0 then return jsonb_build_object('status','bad'); end if;
    if p_fee_pct < 0 or p_fee_pct > 1 then return jsonb_build_object('status','bad_fee'); end if;

    select coalesce(sum(remaining), 0) into v_qh from loans
     where borrower_id = p_borrower and status = 'active' and due_at <= now();
    if v_qh > 0 then
        return jsonb_build_object('status','co_no_qua_han','no_qua_han', v_qh);
    end if;

    insert into users(user_id) values(p_lender)   on conflict(user_id) do nothing;
    insert into users(user_id) values(p_borrower) on conflict(user_id) do nothing;

    v_fee := floor(p_principal * p_fee_pct);
    update users set wallet = wallet - (p_principal + v_fee)
        where user_id = p_lender and wallet >= (p_principal + v_fee);
    get diagnostics v_upd = row_count;
    if v_upd = 0 then return jsonb_build_object('status','poor'); end if;

    update users set wallet = wallet + p_principal where user_id = p_borrower;
    v_due  := floor(p_principal * (1 + p_interest));
    v_when := now() + make_interval(days => p_days);
    insert into loans(lender_id, borrower_id, principal, remaining, due_at, due_amount, late_through)
        values (p_lender, p_borrower, p_principal, v_due, v_when, v_due, v_when)
        returning id into v_id;
    return jsonb_build_object('status','ok','loan_id', v_id, 'remaining', v_due,
                              'due_at', v_when, 'fee', v_fee, 'lender_paid', p_principal + v_fee);
end; $function$;

revoke execute on function public.loan_apply_late_fees(numeric, numeric) from public, anon, authenticated;
revoke execute on function public.loan_collect_all()                     from public, anon, authenticated;
revoke execute on function public.loan_credit(text)                      from public, anon, authenticated;
revoke execute on function public.loan_create(text, text, bigint, numeric, integer, numeric) from public, anon, authenticated;
grant execute on function public.loan_apply_late_fees(numeric, numeric) to service_role;
grant execute on function public.loan_collect_all()                     to service_role;
grant execute on function public.loan_credit(text)                      to service_role;
grant execute on function public.loan_create(text, text, bigint, numeric, integer, numeric) to service_role;

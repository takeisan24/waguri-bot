-- ============================================================
-- 0157_loan_create_system.sql — Quỹ Tín Dụng Kikyo vay TRỰC TIẾP từ hệ thống
--
-- VÌ SAO CÓ FILE NÀY. `/loan borrow` gọi `loan_create('SYSTEM', ...)` — tức dùng RPC của
-- đường vay P2P cũ cho một bên cho vay KHÔNG TỒN TẠI. Hệ quả đo được trên prod 2026-10-22:
--   · không có dòng `users` nào mang `user_id = 'SYSTEM'`
--   · `loan_create` trừ ví bên cho vay với chốt `wallet >= principal + fee` -> 0 dòng
--     -> luôn trả `status = 'poor'`
--   · 0 khoản vay nào có `lender_id = 'SYSTEM'`, 0 dòng `economy_ledger` nào về vay
-- Nói cách khác: tính năng CHƯA BAO GIỜ chạy được, dù 45 người đã đủ Cấp 5 (31 người
-- còn hoạt động trong 30 ngày) nên cổng cấp KHÔNG phải nguyên nhân.
--
-- VÌ SAO KHÔNG nạp ví cho 'SYSTEM' thay vì viết RPC mới:
--   1. Quỹ cạn là tính năng tự chết, không ai biết vì sao.
--   2. `loan_create` còn trừ thêm `FEE_PCT` (5%) vào bên cho vay — phí này vô nghĩa khi
--      bên cho vay chính là hệ thống, và nó làm hạn mức thật lệch khỏi con số đã khoe.
--   3. Nới chốt `wallet >=` cho một user đặc biệt là hở ngay đường P2P đang chạy.
-- Nên: hàm riêng, không có bên cho vay để mà trừ, không có phí.
--
-- `loans.lender_id` là `text not null` KHÔNG có khoá ngoại (0026_loans.sql:8), nên ghi
-- thẳng 'SYSTEM' được — không cần dòng `users` giả.
-- ============================================================

create or replace function public.loan_create_system(
    p_borrower text, p_principal bigint, p_interest numeric, p_days integer)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare v_due bigint; v_id bigint; v_when timestamptz; v_qh bigint; v_dang int;
begin
    -- Chốt tham số TRƯỚC mọi thao tác tiền, để từ chối thì không phải hoàn tác gì.
    if p_principal is null or p_principal <= 0        then return jsonb_build_object('status','bad_amount');   end if;
    if p_interest  is null or p_interest < 0
       or p_interest > 1                              then return jsonb_build_object('status','bad_interest'); end if;
    if p_days      is null or p_days <= 0             then return jsonb_build_object('status','bad_days');     end if;

    -- Nhãn cho economy_ledger: không gắn thì cú nhảy cung tiền sau này bị đọc thành exploit.
    perform set_config('app.ledger_source', 'loan_system', true);

    insert into users(user_id) values (p_borrower) on conflict (user_id) do nothing;
    -- Khoá dòng người vay SAU khi chắc chắn dòng tồn tại: hai lần bấm /loan borrow cùng lúc
    -- phải xếp hàng, không được cùng đi qua hai chốt dưới đây.
    perform 1 from users where user_id = p_borrower for update;

    -- Còn nợ QUÁ HẠN thì không cho vay thêm — cùng ngữ nghĩa với đường P2P (0140).
    select coalesce(sum(remaining), 0) into v_qh
      from loans
     where borrower_id = p_borrower and status = 'active' and due_at <= now();
    if v_qh > 0 then
        return jsonb_build_object('status','co_no_qua_han','no_qua_han', v_qh);
    end if;

    -- Mỗi người CHỈ MỘT khoản vay hệ thống đang hoạt động. Lệnh đã kiểm việc này ở JS,
    -- nhưng kiểm ở JS thì có khe đua tranh; chốt thật phải nằm dưới khoá dòng ở trên.
    select count(*) into v_dang
      from loans
     where borrower_id = p_borrower and lender_id = 'SYSTEM' and status = 'active';
    if v_dang > 0 then
        return jsonb_build_object('status','dang_no');
    end if;

    v_due  := floor(p_principal * (1 + p_interest));
    v_when := now() + make_interval(days => p_days);

    insert into loans (lender_id, borrower_id, principal, remaining, due_at, due_amount, late_through)
    values ('SYSTEM', p_borrower, p_principal, v_due, v_when, v_due, v_when)
    returning id into v_id;

    -- Giải ngân TRONG CÙNG giao dịch với việc ghi nợ. Tách ra hai lời gọi là lớp lỗi đã
    -- vá ba lần ở repo này (0141/0144): ghi nợ xong, trao hỏng, người chơi nợ mà tay trắng.
    update users set wallet = wallet + p_principal where user_id = p_borrower;

    return jsonb_build_object(
        'status','ok', 'loan_id', v_id, 'principal', p_principal,
        'remaining', v_due, 'interest', v_due - p_principal, 'due_at', v_when);
end; $fn$;

-- Postgres tự cấp PUBLIC EXECUTE cho hàm mới. Không REVOKE là ai cầm khoá công khai cũng
-- tự vay tiền cho mình — đúng lỗ đã vá ở 0137/0138.
revoke all on function public.loan_create_system(text, bigint, numeric, integer)
    from public, anon, authenticated;
grant execute on function public.loan_create_system(text, bigint, numeric, integer)
    to service_role;

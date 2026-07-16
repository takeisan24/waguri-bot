-- ============================================================
-- 0088_loan_principal_guard.sql — M8: chặn p_principal <= 0 ở loan_create.
--   Không có guard, principal ÂM biến "wallet - (principal+fee)" thành CỘNG cho lender
--   và ghi nợ borrower -> lender rút tiền của borrower. (Command đã có setMinValue,
--   đây là defense-in-depth ở tầng DB.)
--   Giữ nguyên phần còn lại của bản 0057; chỉ thêm 1 dòng guard đầu hàm.
-- ============================================================
create or replace function loan_create(p_lender text, p_borrower text, p_principal bigint, p_interest numeric, p_days integer)
returns jsonb language plpgsql
set search_path = pg_catalog, public
as $$
declare v_upd int; v_due bigint; v_id bigint; v_when timestamptz; v_fee bigint;
begin
    if p_principal <= 0 then return jsonb_build_object('status','bad'); end if;

    insert into users(user_id) values(p_lender) on conflict(user_id) do nothing;
    insert into users(user_id) values(p_borrower) on conflict(user_id) do nothing;

    -- Phí lập khế ước 5% (đốt) — chống lách thuế chuyển tiền qua vay/trả giữa alt.
    v_fee := floor(p_principal * 0.05);
    update users set wallet = wallet - (p_principal + v_fee)
        where user_id = p_lender and wallet >= (p_principal + v_fee);
    get diagnostics v_upd = row_count;
    if v_upd = 0 then return jsonb_build_object('status','poor'); end if;

    update users set wallet = wallet + p_principal where user_id = p_borrower;
    v_due := floor(p_principal * (1 + p_interest));
    v_when := now() + make_interval(days => p_days);
    insert into loans(lender_id, borrower_id, principal, remaining, due_at)
        values (p_lender, p_borrower, p_principal, v_due, v_when) returning id into v_id;
    return jsonb_build_object('status','ok','loan_id', v_id, 'remaining', v_due, 'due_at', v_when, 'fee', v_fee);
end; $$;

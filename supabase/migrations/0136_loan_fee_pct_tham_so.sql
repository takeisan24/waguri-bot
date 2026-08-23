-- ============================================================
-- 0136_loan_fee_pct_tham_so.sql — tỉ lệ phí lập khế ước thành THAM SỐ.
--
-- VÌ SAO: `loan_create` ghi cứng phí 5% mà JS không hề biết. Hệ quả đo được trên prod:
-- chủ nợ bấm "đồng ý cho vay 10.000", ví tụt từ 100.000 xuống 89.500 — mất 10.500, không
-- một chữ nào trên màn hình giải thích 500 kia đi đâu. RPC vẫn TRẢ VỀ `fee`; chỉ là không
-- ai đọc.
--
-- Tệ hơn, dòng "Lãi 10%" gây hiểu nhầm NGƯỢC cho chủ nợ: bỏ 10.500 thu 11.000, lời thật
-- 500 ≈ 4,76% — chưa bằng một nửa con số họ vừa đọc rồi bấm đồng ý.
--
-- Bản thân khoản phí là thiết kế ĐÚNG (chặn hai tài khoản phụ chuyển tiền qua vay–trả để
-- né thuế của /give), nên không bỏ nó. Chỉ đưa tỉ lệ ra thành tham số để JS và RPC dùng
-- CHUNG một nguồn (config.LOAN.FEE_PCT), rồi công bố cho chủ nợ trước khi họ đồng ý.
--
-- Ghi cứng ở SQL rồi chép tay sang JS chính là kiểu lệch nguồn mà bảng giá Premium (0133)
-- đã phải sinh một cổng riêng để chặn.
--
-- DEFAULT 0.05 giữ mọi lời gọi cũ chạy y nguyên. Thêm chặn `p_fee_pct` ngoài [0,1], và trả
-- thêm `lender_paid` để màn hình khỏi phải tự cộng lại.
-- ============================================================

CREATE OR REPLACE FUNCTION public.loan_create(
    p_lender text, p_borrower text, p_principal bigint,
    p_interest numeric, p_days integer, p_fee_pct numeric DEFAULT 0.05)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_upd int; v_due bigint; v_id bigint; v_when timestamptz; v_fee bigint;
begin
    if p_principal <= 0 then return jsonb_build_object('status','bad'); end if;
    if p_fee_pct < 0 or p_fee_pct > 1 then return jsonb_build_object('status','bad_fee'); end if;

    insert into users(user_id) values(p_lender) on conflict(user_id) do nothing;
    insert into users(user_id) values(p_borrower) on conflict(user_id) do nothing;

    v_fee := floor(p_principal * p_fee_pct);
    update users set wallet = wallet - (p_principal + v_fee)
        where user_id = p_lender and wallet >= (p_principal + v_fee);
    get diagnostics v_upd = row_count;
    if v_upd = 0 then return jsonb_build_object('status','poor'); end if;

    update users set wallet = wallet + p_principal where user_id = p_borrower;
    v_due := floor(p_principal * (1 + p_interest));
    v_when := now() + make_interval(days => p_days);
    insert into loans(lender_id, borrower_id, principal, remaining, due_at)
        values (p_lender, p_borrower, p_principal, v_due, v_when) returning id into v_id;
    return jsonb_build_object('status','ok','loan_id', v_id, 'remaining', v_due,
                              'due_at', v_when, 'fee', v_fee, 'lender_paid', p_principal + v_fee);
end; $function$;

REVOKE ALL ON FUNCTION public.loan_create(text, text, bigint, numeric, integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loan_create(text, text, bigint, numeric, integer, numeric) TO service_role;

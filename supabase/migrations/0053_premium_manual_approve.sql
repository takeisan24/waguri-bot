-- 0053_premium_manual_approve.sql
-- Duyệt thủ công đơn Premium (thanh toán VCB không có cổng auto): owner xác nhận đã nhận tiền.
-- claimed_at: buyer bấm "Tôi đã chuyển khoản" -> để owner biết đơn nào cần kiểm tra trước.
ALTER TABLE premium_orders ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Kích hoạt đơn theo mã, KHÔNG kiểm tra số tiền (owner đã tự đối chiếu). Idempotent.
CREATE OR REPLACE FUNCTION approve_premium_order(p_code text, p_ref text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order premium_orders; v_until timestamptz;
BEGIN
    SELECT * INTO v_order FROM premium_orders WHERE code = p_code FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    IF v_order.status = 'paid' THEN
        RETURN jsonb_build_object('ok', true, 'already', true,
                                  'user_id', v_order.user_id, 'months', v_order.months);
    END IF;

    UPDATE users
       SET premium_until = GREATEST(COALESCE(premium_until, now()), now()) + (v_order.months || ' months')::interval
     WHERE user_id = v_order.user_id
     RETURNING premium_until INTO v_until;
    IF NOT FOUND THEN
        INSERT INTO users (user_id, premium_until)
        VALUES (v_order.user_id, now() + (v_order.months || ' months')::interval)
        ON CONFLICT (user_id) DO UPDATE SET premium_until = EXCLUDED.premium_until
        RETURNING premium_until INTO v_until;
    END IF;

    UPDATE premium_orders SET status = 'paid', paid_at = now(), ref = COALESCE(p_ref, 'manual') WHERE id = v_order.id;
    RETURN jsonb_build_object('ok', true, 'user_id', v_order.user_id,
                              'months', v_order.months, 'until', v_until);
END $$;

-- Smoke: tạo đơn -> approve (không cần đúng tiền) -> paid + idempotent.
DO $$
DECLARE o premium_orders; r jsonb; u text := '999999999000000003';
BEGIN
    DELETE FROM premium_orders WHERE user_id = u;
    DELETE FROM users WHERE user_id = u;
    o := create_premium_order(u, 'm6', 6, 99000);
    r := approve_premium_order(o.code, 'manual');
    ASSERT (r->>'ok')::bool, 'approve fail';
    ASSERT (SELECT premium_until > now() + interval '5 months' FROM users WHERE user_id = u), 'gia han sai';
    r := approve_premium_order(o.code, 'manual');
    ASSERT (r->>'already')::bool, 'khong idempotent';
    DELETE FROM premium_orders WHERE user_id = u;
    DELETE FROM users WHERE user_id = u;
    RAISE NOTICE 'manual_approve smoke OK';
END $$;

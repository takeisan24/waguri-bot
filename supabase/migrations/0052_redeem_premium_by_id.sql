-- 0052_redeem_premium_by_id.sql
-- PayOS webhook khớp đơn theo `orderCode` (= premium_orders.id), KHÔNG theo description
-- (PayOS tự sinh nội dung CK nên description không tin cậy). Hàm gia hạn theo id, idempotent.
CREATE OR REPLACE FUNCTION redeem_premium_order_by_id(p_id bigint, p_amount int, p_ref text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order premium_orders; v_until timestamptz;
BEGIN
    SELECT * INTO v_order FROM premium_orders WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    IF v_order.status = 'paid' THEN
        RETURN jsonb_build_object('ok', true, 'already', true, 'user_id', v_order.user_id);
    END IF;
    IF p_amount < v_order.amount THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'amount',
                                  'user_id', v_order.user_id, 'need', v_order.amount, 'got', p_amount);
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

    UPDATE premium_orders SET status = 'paid', paid_at = now(), ref = p_ref WHERE id = v_order.id;
    RETURN jsonb_build_object('ok', true, 'user_id', v_order.user_id,
                              'months', v_order.months, 'until', v_until);
END $$;

-- Smoke: tạo đơn -> redeem theo id -> paid + idempotent + chặn thiếu tiền.
DO $$
DECLARE o premium_orders; r jsonb; u text := '999999999000000002';
BEGIN
    DELETE FROM premium_orders WHERE user_id = u;
    DELETE FROM users WHERE user_id = u;
    o := create_premium_order(u, 'm1', 1, 25000);
    r := redeem_premium_order_by_id(o.id, 25000, 'PAYOSREF1');
    ASSERT (r->>'ok')::bool, 'redeem by id fail';
    ASSERT (SELECT premium_until > now() FROM users WHERE user_id = u), 'premium chua set';
    r := redeem_premium_order_by_id(o.id, 25000, 'PAYOSREF1');
    ASSERT (r->>'already')::bool, 'khong idempotent';
    o := create_premium_order(u, 'm3', 3, 60000);
    r := redeem_premium_order_by_id(o.id, 10000, 'X');
    ASSERT (r->>'reason') = 'amount', 'khong chan thieu tien';
    DELETE FROM premium_orders WHERE user_id = u;
    DELETE FROM users WHERE user_id = u;
    RAISE NOTICE 'redeem_by_id smoke OK';
END $$;

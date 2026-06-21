-- 0050_premium_orders.sql
-- Mua Waguri Premium qua SePay (VietQR + webhook biến động số dư).
-- Luồng: web tạo đơn (create_premium_order) -> hiện VietQR nội dung = code ->
-- user chuyển khoản -> SePay bắn webhook tới bot -> redeem_premium_order gia hạn premium_until.

CREATE TABLE IF NOT EXISTS premium_orders (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       text UNIQUE NOT NULL,              -- mã trong NỘI DUNG chuyển khoản (chỉ A-Z0-9)
    user_id    text NOT NULL,                     -- Discord ID người mua
    plan       text NOT NULL,                     -- m1 | m3 | m6
    months     int  NOT NULL,
    amount     int  NOT NULL,                     -- số tiền VND phải trả
    status     text NOT NULL DEFAULT 'pending',   -- pending | paid
    ref        text,                              -- referenceCode từ SePay (đối soát)
    created_at timestamptz NOT NULL DEFAULT now(),
    paid_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_premium_orders_user ON premium_orders (user_id, created_at DESC);

-- Tạo đơn + sinh mã ngắn duy nhất (web gọi bằng service-role).
CREATE OR REPLACE FUNCTION create_premium_order(p_user text, p_plan text, p_months int, p_amount int)
RETURNS premium_orders
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_code text; v_row premium_orders;
BEGIN
    LOOP
        -- WAGURI + 8 hex IN HOA: chỉ chữ-số nên ngân hàng/SePay không bóp méo nội dung.
        v_code := 'WAGURI' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
        BEGIN
            INSERT INTO premium_orders (code, user_id, plan, months, amount)
            VALUES (v_code, p_user, p_plan, p_months, p_amount)
            RETURNING * INTO v_row;
            RETURN v_row;
        EXCEPTION WHEN unique_violation THEN
            -- trùng mã (cực hiếm) -> thử lại
        END;
    END LOOP;
END $$;

-- Webhook SePay gọi (qua bot): khớp đơn theo code, gia hạn Premium. IDEMPOTENT.
CREATE OR REPLACE FUNCTION redeem_premium_order(p_code text, p_amount int, p_ref text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order premium_orders; v_until timestamptz;
BEGIN
    SELECT * INTO v_order FROM premium_orders WHERE code = p_code FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    IF v_order.status = 'paid' THEN
        -- webhook gọi lại lần 2 -> không cộng dồn nữa
        RETURN jsonb_build_object('ok', true, 'already', true, 'user_id', v_order.user_id);
    END IF;
    IF p_amount < v_order.amount THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'amount',
                                  'user_id', v_order.user_id, 'need', v_order.amount, 'got', p_amount);
    END IF;

    -- Gia hạn: cộng dồn từ mốc còn hạn (hoặc từ now nếu đã hết hạn / chưa có).
    UPDATE users
       SET premium_until = GREATEST(COALESCE(premium_until, now()), now()) + (v_order.months || ' months')::interval
     WHERE user_id = v_order.user_id
     RETURNING premium_until INTO v_until;
    IF NOT FOUND THEN
        -- mua nhưng chưa từng chơi (chưa có hàng users) -> tạo tối thiểu
        INSERT INTO users (user_id, premium_until)
        VALUES (v_order.user_id, now() + (v_order.months || ' months')::interval)
        ON CONFLICT (user_id) DO UPDATE SET premium_until = EXCLUDED.premium_until
        RETURNING premium_until INTO v_until;
    END IF;

    UPDATE premium_orders SET status = 'paid', paid_at = now(), ref = p_ref WHERE id = v_order.id;
    RETURN jsonb_build_object('ok', true, 'user_id', v_order.user_id,
                              'months', v_order.months, 'until', v_until);
END $$;

-- Smoke test: tạo đơn giả -> redeem -> kiểm tra premium_until set, idempotent.
DO $$
DECLARE o premium_orders; r jsonb; u text := '999999999000000001';
BEGIN
    DELETE FROM premium_orders WHERE user_id = u;
    DELETE FROM users WHERE user_id = u;
    o := create_premium_order(u, 'm1', 1, 25000);
    ASSERT o.code LIKE 'WAGURI%', 'code sai';
    r := redeem_premium_order(o.code, 25000, 'TESTREF1');
    ASSERT (r->>'ok')::bool, 'redeem fail';
    ASSERT (SELECT premium_until > now() FROM users WHERE user_id = u), 'premium chua set';
    r := redeem_premium_order(o.code, 25000, 'TESTREF1');  -- gọi lại
    ASSERT (r->>'already')::bool, 'khong idempotent';
    -- thiếu tiền
    o := create_premium_order(u, 'm3', 3, 60000);
    r := redeem_premium_order(o.code, 10000, 'X');
    ASSERT (r->>'reason') = 'amount', 'khong chan thieu tien';
    -- dọn
    DELETE FROM premium_orders WHERE user_id = u;
    DELETE FROM users WHERE user_id = u;
    RAISE NOTICE 'premium_orders smoke OK';
END $$;

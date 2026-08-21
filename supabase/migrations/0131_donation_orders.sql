-- ============================================================
-- 0131_donation_orders.sql — Ủng hộ tuỳ tâm (donate) dùng CHUNG bảng đơn với Premium.
--
-- BỐI CẢNH: tài khoản nhận tiền là Vietcombank CÁ NHÂN -> không có webhook biến động số
-- dư -> mọi đơn đều owner duyệt tay. Đường ống "tạo đơn -> người mua báo đã CK -> DM owner
-- kèm nút -> owner chạm duyệt" đã dựng xong cho Premium. Donate tái dùng NGUYÊN đường ống
-- đó; chỉ khác ở bước cuối: cấp HUY HIỆU thay vì cộng hạn Premium.
--
-- KHÁC BIỆT PHẢI GIỮ (lý do tách `kind` thay vì nhét chung một rọ):
--   · Premium = GIAO DỊCH. Trả tiền -> có quyền lợi, có hạn dùng, có nghĩa vụ phải giao.
--   · Donate  = QUÀ TẶNG.  Không quyền lợi, không hạn dùng, không có gì để vỡ.
-- Trộn hai thứ này lại là cách chắc chắn nhất để một ngày nào đó cấp nhầm.
--
-- CHỐT CHẶN QUAN TRỌNG NHẤT ở đây: `approve_premium_order` bị vá để TỪ CHỐI đơn donate.
-- Nếu không, nút "✅ Kích hoạt" và `/premium-admin duyet` sẵn có sẽ chạy đơn donate qua
-- đường Premium với months = 0 -> ghi `premium_until = now()` cho người chưa từng có Premium
-- (biến họ thành "Premium vừa hết hạn"), và im lặng KHÔNG cấp huy hiệu.
--
-- Idempotent.
-- ============================================================

ALTER TABLE premium_orders ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'premium';

DO $ktra$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'premium_orders_kind_check') THEN
        ALTER TABLE premium_orders
            ADD CONSTRAINT premium_orders_kind_check CHECK (kind IN ('premium', 'donate'));
    END IF;
END $ktra$;

-- Tạo đơn ủng hộ tuỳ tâm. amount = 0 nghĩa là "để người ủng hộ tự điền số tiền trong app
-- ngân hàng" (VietQR không ghim số tiền) — đúng tinh thần "bao nhiêu cũng quý".
CREATE OR REPLACE FUNCTION create_donation_order(p_user text, p_amount int DEFAULT 0)
RETURNS premium_orders
LANGUAGE plpgsql SECURITY DEFINER
-- Ghim CẢ pg_catalog, khớp bản đang chạy trên prod: migration 0102 đã phải đi khôi
-- phục đúng lớp hardening này một lần rồi. `= public` sẽ âm thầm làm nó thụt lùi.
SET search_path = pg_catalog, public AS $fn$
DECLARE v_code text; v_row premium_orders;
BEGIN
    IF p_amount < 0 THEN
        RAISE EXCEPTION 'so tien khong duoc am';
    END IF;
    LOOP
        v_code := 'WAGURI' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
        BEGIN
            INSERT INTO premium_orders (code, user_id, plan, months, amount, kind)
            VALUES (v_code, p_user, 'donate', 0, COALESCE(p_amount, 0), 'donate')
            RETURNING * INTO v_row;
            RETURN v_row;
        EXCEPTION WHEN unique_violation THEN
            -- trùng mã (cực hiếm) -> thử lại
        END;
    END LOOP;
END $fn$;

-- Owner xác nhận đã nhận tiền ủng hộ -> đánh dấu đã trả + cấp huy hiệu 💝 VĨNH VIỄN.
-- KHÔNG đụng tới `premium_until`: ủng hộ không mua được quyền lợi, đó là điểm mấu chốt.
-- Idempotent: gọi lại trả 'already', không cấp lại, không ghi đè `unlocked_at`.
CREATE OR REPLACE FUNCTION approve_donation(p_code text, p_ref text, p_badge_id text DEFAULT 'supporter')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
-- Ghim CẢ pg_catalog, khớp bản đang chạy trên prod: migration 0102 đã phải đi khôi
-- phục đúng lớp hardening này một lần rồi. `= public` sẽ âm thầm làm nó thụt lùi.
SET search_path = pg_catalog, public AS $fn$
DECLARE v_order premium_orders; v_badge_new boolean := false;
BEGIN
    SELECT * INTO v_order FROM premium_orders WHERE code = p_code FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    IF v_order.kind <> 'donate' THEN
        -- Đơn Premium lọt vào đường donate -> từ chối, đừng đoán ý người gọi.
        RETURN jsonb_build_object('ok', false, 'reason', 'wrong_kind', 'kind', v_order.kind);
    END IF;
    IF v_order.status = 'paid' THEN
        RETURN jsonb_build_object('ok', true, 'already', true,
                                  'user_id', v_order.user_id, 'amount', v_order.amount);
    END IF;

    -- Người ủng hộ có thể chưa từng chơi -> chưa có hàng `users`. Tạo tối thiểu để hồ sơ
    -- và huy hiệu của họ hiển thị được.
    INSERT INTO users (user_id) VALUES (v_order.user_id) ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO user_badges (user_id, badge_id)
    VALUES (v_order.user_id, p_badge_id)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    v_badge_new := FOUND;

    UPDATE premium_orders
       SET status = 'paid', paid_at = now(), ref = COALESCE(p_ref, 'manual')
     WHERE id = v_order.id;

    RETURN jsonb_build_object('ok', true, 'user_id', v_order.user_id,
                              'amount', v_order.amount, 'badge_new', v_badge_new,
                              'badge_id', p_badge_id);
END $fn$;

-- CHỐT CHẶN: đường duyệt Premium phải TỪ CHỐI đơn donate.
-- Giữ nguyên phần còn lại của 0053, chỉ thêm đúng một cửa kiểm tra `kind`.
CREATE OR REPLACE FUNCTION approve_premium_order(p_code text, p_ref text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
-- Ghim CẢ pg_catalog, khớp bản đang chạy trên prod: migration 0102 đã phải đi khôi
-- phục đúng lớp hardening này một lần rồi. `= public` sẽ âm thầm làm nó thụt lùi.
SET search_path = pg_catalog, public AS $fn$
DECLARE v_order premium_orders; v_until timestamptz;
BEGIN
    SELECT * INTO v_order FROM premium_orders WHERE code = p_code FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    IF v_order.kind = 'donate' THEN
        -- months = 0 sẽ đặt premium_until = now() (tức "vừa hết hạn") và không cấp huy hiệu.
        -- Thà từ chối, để caller đi đúng đường `approve_donation`.
        RETURN jsonb_build_object('ok', false, 'reason', 'wrong_kind', 'kind', v_order.kind);
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
END $fn$;

REVOKE ALL ON FUNCTION public.create_donation_order(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_donation_order(text, int) TO service_role;
REVOKE ALL ON FUNCTION public.approve_donation(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_donation(text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.approve_premium_order(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_premium_order(text, text) TO service_role;

-- ============================================================
-- SMOKE: donate cấp huy hiệu & KHÔNG đụng premium_until; hai đường duyệt từ chối chéo nhau.
-- ============================================================
DO $smoke$
DECLARE o premium_orders; r jsonb; u text := '999999999000000031';
BEGIN
    DELETE FROM user_badges WHERE user_id = u;
    DELETE FROM premium_orders WHERE user_id = u;
    DELETE FROM users WHERE user_id = u;

    -- 1. Duyệt đơn ủng hộ -> có huy hiệu, KHÔNG có Premium.
    o := create_donation_order(u, 50000);
    ASSERT o.kind = 'donate' AND o.months = 0, 'don donate sai hinh dang';
    r := approve_donation(o.code, 'test', 'supporter');
    ASSERT (r->>'ok')::bool, 'approve_donation that bai';
    ASSERT EXISTS (SELECT 1 FROM user_badges WHERE user_id = u AND badge_id = 'supporter'), 'khong cap huy hieu';
    ASSERT (SELECT premium_until IS NULL FROM users WHERE user_id = u), 'donate KHONG duoc cham vao premium_until';

    -- 2. Idempotent: duyệt lại không cấp lần hai.
    r := approve_donation(o.code, 'test', 'supporter');
    ASSERT (r->>'already')::bool, 'approve_donation khong idempotent';

    -- 3. CHỐT CHẶN: đơn donate KHÔNG được đi qua đường Premium.
    o := create_donation_order(u, 20000);
    r := approve_premium_order(o.code, 'test');
    ASSERT (r->>'reason') = 'wrong_kind', 'don donate van lot qua duong Premium!';
    ASSERT (SELECT premium_until IS NULL FROM users WHERE user_id = u), 'premium_until bi ghi de boi don donate';

    -- 4. Chiều ngược lại: đơn Premium KHÔNG được đi qua đường donate.
    o := create_premium_order(u, 'm1', 1, 25000);
    r := approve_donation(o.code, 'test', 'supporter');
    ASSERT (r->>'reason') = 'wrong_kind', 'don Premium van lot qua duong donate!';

    -- 5. Đơn Premium vẫn duyệt bình thường như cũ.
    r := approve_premium_order(o.code, 'test');
    ASSERT (r->>'ok')::bool, 'duyet Premium binh thuong bi hong';
    ASSERT (SELECT premium_until > now() FROM users WHERE user_id = u), 'premium_until chua duoc cong';

    DELETE FROM user_badges WHERE user_id = u;
    DELETE FROM premium_orders WHERE user_id = u;
    DELETE FROM users WHERE user_id = u;
    RAISE NOTICE '0131 donation_orders smoke OK';
END $smoke$;

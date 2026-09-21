-- ============================================================
-- 0151_bakery_vip_orders.sql
-- Tiệm Bánh Gekka Phase 2: Đơn Hàng VIP Khách Quen & Điểm Danh Tiếng
--
-- TÍNH NĂNG:
--   1. Thêm cột `reputation` (Điểm Danh Tiếng) vào bảng `bakeries`.
--   2. Bảng `bakery_completed_orders` theo dõi đơn hàng VIP đã hoàn thành trong ngày (0-cron, tất định).
--   3. RPC nguyên tử `deliver_bakery_order` kiểm tra và trừ nguyên liệu/bánh, cộng thưởng Xu + EXP + Danh Tiếng.
--
-- BẢO MẬT & NGUYÊN TẮC:
--   - RLS bật trên `bakery_completed_orders`.
--   - RPC có search_path = pg_catalog, public và FOR UPDATE trên kho đồ + tiệm bánh (chống TOCTOU/race conditions).
--   - Chỉ service_role được thực thi RPC ghi.
-- ============================================================

-- 1. Bổ sung cột điểm danh tiếng cho tiệm bánh
ALTER TABLE public.bakeries ADD COLUMN IF NOT EXISTS reputation INT NOT NULL DEFAULT 0;

-- 2. Bảng theo dõi các đơn hàng VIP đã giao trong ngày
CREATE TABLE IF NOT EXISTS public.bakery_completed_orders (
    user_id TEXT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    order_id TEXT NOT NULL,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, order_date, order_id)
);

-- Bật RLS và phân quyền
ALTER TABLE public.bakery_completed_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'bakery_completed_orders' AND policyname = 'Allow service_role all on bakery_completed_orders'
    ) THEN
        CREATE POLICY "Allow service_role all on bakery_completed_orders" 
            ON public.bakery_completed_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'bakery_completed_orders' AND policyname = 'Allow public read on bakery_completed_orders'
    ) THEN
        CREATE POLICY "Allow public read on bakery_completed_orders" 
            ON public.bakery_completed_orders FOR SELECT TO anon, authenticated USING (true);
    END IF;
END $$;

-- 3. RPC giao đơn hàng VIP nguyên tử
CREATE OR REPLACE FUNCTION public.deliver_bakery_order(
    p_user_id TEXT,
    p_order_date DATE,
    p_order_id TEXT,
    p_required_items JSONB,
    p_reward_coins BIGINT,
    p_reward_exp INT,
    p_reward_rep INT,
    p_cake_progress BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_item RECORD;
    v_item_id TEXT;
    v_req_qty INT;
    v_inv_qty INT;
    v_new_wallet BIGINT;
    v_new_exp BIGINT;
    v_new_rep INT;
BEGIN
    -- 1. Kiểm tra tiệm bánh tồn tại
    IF NOT EXISTS (SELECT 1 FROM public.bakeries WHERE user_id = p_user_id FOR UPDATE) THEN
        RETURN jsonb_build_object('success', false, 'error', 'NO_BAKERY');
    END IF;

    -- 2. Kiểm tra xem đơn đã giao hôm nay chưa
    IF EXISTS (
        SELECT 1 FROM public.bakery_completed_orders 
        WHERE user_id = p_user_id AND order_date = p_order_date AND order_id = p_order_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'ALREADY_DELIVERED');
    END IF;

    -- 3. Kiểm tra kho đồ cho tất cả vật phẩm yêu cầu (FOR UPDATE)
    FOR v_item IN SELECT * FROM jsonb_each_text(p_required_items) LOOP
        v_item_id := v_item.key;
        v_req_qty := v_item.value::INT;

        SELECT quantity INTO v_inv_qty 
        FROM public.inventory 
        WHERE user_id = p_user_id AND item_id = v_item_id
        FOR UPDATE;

        IF v_inv_qty IS NULL OR v_inv_qty < v_req_qty THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'MISSING_ITEMS',
                'item_id', v_item_id,
                'required', v_req_qty,
                'available', COALESCE(v_inv_qty, 0)
            );
        END IF;
    END LOOP;

    -- 4. Trừ vật phẩm trong kho đồ
    FOR v_item IN SELECT * FROM jsonb_each_text(p_required_items) LOOP
        v_item_id := v_item.key;
        v_req_qty := v_item.value::INT;

        UPDATE public.inventory
        SET quantity = quantity - v_req_qty
        WHERE user_id = p_user_id AND item_id = v_item_id;

        DELETE FROM public.inventory
        WHERE user_id = p_user_id AND item_id = v_item_id AND quantity <= 0;
    END LOOP;

    -- 5. Ghi nhận đã giao đơn hàng
    INSERT INTO public.bakery_completed_orders (user_id, order_date, order_id, delivered_at)
    VALUES (p_user_id, p_order_date, p_order_id, now());

    -- 6. Cộng thưởng cho user (ví tiền + EXP)
    UPDATE public.users
    SET wallet = wallet + p_reward_coins,
        exp = exp + p_reward_exp
    WHERE user_id = p_user_id
    RETURNING wallet, exp INTO v_new_wallet, v_new_exp;

    -- 7. Cập nhật tiệm bánh (Danh tiếng + tiến trình bánh)
    UPDATE public.bakeries
    SET reputation = reputation + p_reward_rep,
        cake_progress = cake_progress + p_cake_progress
    WHERE user_id = p_user_id
    RETURNING reputation INTO v_new_rep;

    RETURN jsonb_build_object(
        'success', true,
        'reward_coins', p_reward_coins,
        'reward_exp', p_reward_exp,
        'reward_rep', p_reward_rep,
        'new_wallet', v_new_wallet,
        'new_exp', v_new_exp,
        'new_reputation', v_new_rep
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deliver_bakery_order(TEXT, DATE, TEXT, JSONB, BIGINT, INT, INT, BIGINT) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.deliver_bakery_order(TEXT, DATE, TEXT, JSONB, BIGINT, INT, INT, BIGINT) TO service_role;

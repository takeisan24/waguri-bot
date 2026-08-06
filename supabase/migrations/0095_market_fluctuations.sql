-- Migration 0095: Thị Trường & Chợ Nông Thủy Sản Biến Động Hàng Giờ
CREATE TABLE IF NOT EXISTS public.market_prices (
    item_id TEXT PRIMARY KEY,
    base_price BIGINT NOT NULL,
    current_price BIGINT NOT NULL,
    multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.00,
    trend TEXT NOT NULL DEFAULT 'STABLE', -- 'UP', 'DOWN', 'STABLE'
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.market_history (
    id SERIAL PRIMARY KEY,
    item_id TEXT NOT NULL,
    price BIGINT NOT NULL,
    multiplier NUMERIC(5,2) NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_history_item ON public.market_history(item_id, recorded_at DESC);

ALTER TABLE public.market_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.market_prices TO anon, authenticated, service_role;
GRANT SELECT ON public.market_history TO anon, authenticated, service_role;
GRANT ALL ON public.market_prices TO service_role;
GRANT ALL ON public.market_history TO service_role;

-- Nạp sẵn dữ liệu giá cơ sở cho các loại nông/thủy/khoáng sản
INSERT INTO public.market_prices (item_id, base_price, current_price, multiplier, trend)
VALUES
    ('lua_nuoc', 500, 500, 1.00, 'STABLE'),
    ('ca_chua', 800, 800, 1.00, 'STABLE'),
    ('khoai_tay', 1200, 1200, 1.00, 'STABLE'),
    ('dua_hau', 2500, 2500, 1.00, 'STABLE'),
    ('thit_heo_2500', 2500, 2500, 1.00, 'STABLE'),
    ('ca_tuoi', 600, 600, 1.00, 'STABLE'),
    ('ca_koi', 5000, 5000, 1.00, 'STABLE'),
    ('ca_rong', 15000, 15000, 1.00, 'STABLE'),
    ('sieu_cap_gem', 8000, 8000, 1.00, 'STABLE'),
    ('vang_dong_trieu', 20000, 20000, 1.00, 'STABLE'),
    ('go_ram', 400, 400, 1.00, 'STABLE'),
    ('ky_nam', 25000, 25000, 1.00, 'STABLE')
ON CONFLICT (item_id) DO NOTHING;

-- RPC nguyên tử Bán Vật Phẩm theo Giá Chợ
CREATE OR REPLACE FUNCTION public.sell_item_market(
    p_user_id TEXT,
    p_item_id TEXT,
    p_amount INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inv_amount INT;
    v_unit_price BIGINT;
    v_total_earned BIGINT;
    v_new_wallet BIGINT;
BEGIN
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
    END IF;

    -- 1. Kiểm tra số lượng trong inventory
    SELECT quantity INTO v_inv_amount
    FROM public.inventory
    WHERE user_id = p_user_id AND item_id = p_item_id;

    IF v_inv_amount IS NULL OR v_inv_amount < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_ENOUGH_ITEMS', 'available', COALESCE(v_inv_amount, 0));
    END IF;

    -- 2. Lấy giá chợ hiện tại (fallback sang base_price nếu chưa có)
    SELECT current_price INTO v_unit_price
    FROM public.market_prices
    WHERE item_id = p_item_id;

    IF v_unit_price IS NULL OR v_unit_price <= 0 THEN
        v_unit_price := 500; -- default fallback
    END IF;

    v_total_earned := v_unit_price * p_amount;

    -- 3. Trừ vật phẩm
    IF v_inv_amount = p_amount THEN
        DELETE FROM public.inventory WHERE user_id = p_user_id AND item_id = p_item_id;
    ELSE
        UPDATE public.inventory SET quantity = quantity - p_amount WHERE user_id = p_user_id AND item_id = p_item_id;
    END IF;

    -- 4. Cộng tiền vào ví nguyên tử
    UPDATE public.users
    SET wallet = wallet + v_total_earned
    WHERE user_id = p_user_id
    RETURNING wallet INTO v_new_wallet;

    RETURN jsonb_build_object(
        'success', true,
        'earned', v_total_earned,
        'unit_price', v_unit_price,
        'amount', p_amount,
        'new_wallet', v_new_wallet
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sell_item_market(TEXT, TEXT, INT) TO service_role, authenticated, anon;

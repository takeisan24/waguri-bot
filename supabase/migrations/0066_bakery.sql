-- ============================================================
-- 0066_bakery.sql — Tiệm Bánh Gekka (kinh doanh thụ động, Phase 1 MVP)
-- Xem docs/design-tiem-banh-gekka.md. Mô hình: nạp nguyên liệu (orphan farm outputs)
-- -> stock "doanh thu tiềm năng" (VNĐ) -> tiệm nướng RATE/phút, trần capacity/lần thu -> /thu về ví.
-- Hybrid: mỗi CAKE_EVERY doanh thu -> RPC trả số bánh, JS tặng item (ve_vip).
-- Bảo mật: pin search_path + REVOKE anon/authenticated (đúng posture 0054/0055 — chỉ service key gọi).
-- ============================================================

CREATE TABLE IF NOT EXISTS bakeries (
    user_id         TEXT PRIMARY KEY,
    level           INT    NOT NULL DEFAULT 1,
    stock           BIGINT NOT NULL DEFAULT 0,     -- kho doanh thu tiềm năng (VNĐ), nạp từ nguyên liệu
    cake_progress   BIGINT NOT NULL DEFAULT 0,     -- tiến trình hybrid tặng bánh
    staff           JSONB  NOT NULL DEFAULT '[]',  -- Phase 2
    decor           JSONB  NOT NULL DEFAULT '[]',  -- Phase 2
    last_collect_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    opened_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nguyên liệu mới: Cá Tươi (đóng vòng hở /fish). shop_hidden -> chỉ rơi khi câu, /sell được.
INSERT INTO items (id,name,description,price,type,effect_type,effect_value,effect_duration_hours,shop_hidden) VALUES
 ('ca_tuoi','Cá Tươi','Câu được từ /fish — làm nhân bánh mặn tại tiệm Gekka. /sell được.',300,'material','none',0,1,true)
ON CONFLICT (id) DO NOTHING;

-- Mở tiệm: cần vật phẩm "giấy phép" (bo_do_sua_xe) + đủ tiền. Cấp tối thiểu kiểm ở JS.
CREATE OR REPLACE FUNCTION bakery_open(p_user_id TEXT, p_cost BIGINT, p_tool TEXT)
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_wallet BIGINT; v_tool INT;
BEGIN
    IF EXISTS(SELECT 1 FROM bakeries WHERE user_id=p_user_id) THEN RETURN 'has'; END IF;
    SELECT quantity INTO v_tool FROM inventory WHERE user_id=p_user_id AND item_id=p_tool;
    IF v_tool IS NULL OR v_tool < 1 THEN RETURN 'no_tool'; END IF;
    SELECT wallet INTO v_wallet FROM users WHERE user_id=p_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN 'no_user'; END IF;
    IF v_wallet < p_cost THEN RETURN 'poor'; END IF;
    UPDATE users SET wallet=wallet-p_cost WHERE user_id=p_user_id;
    INSERT INTO bakeries(user_id) VALUES (p_user_id);
    RETURN 'ok';
END $$;

-- Nạp nguyên liệu: trừ p_qty item khỏi kho + cộng p_gain (giá×sl×markup, tính ở JS) vào stock.
CREATE OR REPLACE FUNCTION bakery_stock(p_user_id TEXT, p_item_id TEXT, p_qty INT, p_gain BIGINT)
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_qty INT;
BEGIN
    IF p_qty <= 0 THEN RETURN 'bad_qty'; END IF;
    IF NOT EXISTS(SELECT 1 FROM bakeries WHERE user_id=p_user_id) THEN RETURN 'no_bakery'; END IF;
    SELECT quantity INTO v_qty FROM inventory WHERE user_id=p_user_id AND item_id=p_item_id FOR UPDATE;
    IF v_qty IS NULL OR v_qty < p_qty THEN RETURN 'no_item'; END IF;
    UPDATE inventory SET quantity=quantity-p_qty WHERE user_id=p_user_id AND item_id=p_item_id;
    DELETE FROM inventory WHERE user_id=p_user_id AND item_id=p_item_id AND quantity<=0;
    UPDATE bakeries SET stock=stock+p_gain WHERE user_id=p_user_id;
    RETURN 'ok';
END $$;

-- Thu doanh thu (LAZY — mirror lib/bakery.computeBake + cakesFromRevenue).
-- baked_min = min(thời gian trôi, kho đủ, trần). Cộng ví, trừ stock, dời mốc, tính bánh.
CREATE OR REPLACE FUNCTION bakery_collect(p_user_id TEXT, p_rate INT, p_cap BIGINT, p_cake_every BIGINT)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_stock BIGINT; v_last TIMESTAMPTZ; v_prog BIGINT;
        v_elapsed_min BIGINT; v_cap_min BIGINT; v_stock_min BIGINT; v_baked_min BIGINT;
        v_revenue BIGINT; v_total BIGINT; v_cakes INT;
BEGIN
    SELECT stock, last_collect_at, cake_progress INTO v_stock, v_last, v_prog
        FROM bakeries WHERE user_id=p_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('result','no_bakery'); END IF;

    v_elapsed_min := floor(EXTRACT(EPOCH FROM (now()-v_last)) / 60);
    v_cap_min     := floor(p_cap / p_rate);
    v_stock_min   := floor(v_stock / p_rate);
    v_baked_min   := least(v_elapsed_min, v_stock_min, v_cap_min);
    IF v_baked_min <= 0 THEN
        RETURN jsonb_build_object('result','empty','revenue',0,'stock',v_stock);
    END IF;

    v_revenue := v_baked_min * p_rate;
    v_total   := v_prog + v_revenue;
    v_cakes   := floor(v_total / p_cake_every);

    UPDATE bakeries SET
        stock           = stock - v_revenue,
        cake_progress   = v_total - v_cakes * p_cake_every,
        last_collect_at = v_last + (v_baked_min * interval '1 minute')
        WHERE user_id=p_user_id;
    UPDATE users SET wallet = wallet + v_revenue WHERE user_id=p_user_id;

    RETURN jsonb_build_object('result','ok','revenue',v_revenue,'cakes',v_cakes,
        'stock_left', v_stock - v_revenue,
        'capped', (v_elapsed_min > v_cap_min AND v_cap_min <= v_stock_min));
END $$;

-- Nâng cấp: trừ tiền + vật liệu (jsonb {item:qty}); level+1 nếu chưa max.
CREATE OR REPLACE FUNCTION bakery_upgrade(p_user_id TEXT, p_cost BIGINT, p_mats JSONB, p_max_level INT)
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_level INT; v_wallet BIGINT; v_key TEXT; v_need INT; v_have INT;
BEGIN
    SELECT level INTO v_level FROM bakeries WHERE user_id=p_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN 'no_bakery'; END IF;
    IF v_level >= p_max_level THEN RETURN 'max'; END IF;
    SELECT wallet INTO v_wallet FROM users WHERE user_id=p_user_id FOR UPDATE;
    IF v_wallet < p_cost THEN RETURN 'poor'; END IF;
    -- kiểm đủ mọi vật liệu trước
    FOR v_key, v_need IN SELECT key, value::int FROM jsonb_each_text(p_mats) LOOP
        SELECT quantity INTO v_have FROM inventory WHERE user_id=p_user_id AND item_id=v_key;
        IF v_have IS NULL OR v_have < v_need THEN RETURN 'no_mats'; END IF;
    END LOOP;
    -- trừ vật liệu + tiền + lên cấp
    FOR v_key, v_need IN SELECT key, value::int FROM jsonb_each_text(p_mats) LOOP
        UPDATE inventory SET quantity=quantity-v_need WHERE user_id=p_user_id AND item_id=v_key;
    END LOOP;
    DELETE FROM inventory WHERE user_id=p_user_id AND quantity<=0;
    UPDATE users SET wallet=wallet-p_cost WHERE user_id=p_user_id;
    UPDATE bakeries SET level=level+1 WHERE user_id=p_user_id;
    RETURN 'ok';
END $$;

-- Chỉ service key (bot/web-admin) được gọi — chặn anon/authenticated (đúng posture bảo mật).
REVOKE EXECUTE ON FUNCTION bakery_open(TEXT,BIGINT,TEXT)              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION bakery_stock(TEXT,TEXT,INT,BIGINT)        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION bakery_collect(TEXT,INT,BIGINT,BIGINT)    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION bakery_upgrade(TEXT,BIGINT,JSONB,INT)     FROM anon, authenticated;

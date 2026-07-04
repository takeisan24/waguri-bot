-- ============================================================
-- 0070_bakery_phase2.sql — Tiệm Bánh Gekka (Phase 2 & 3)
-- NPC Staff, Decor, mid-tier items, new fish tiers, and gifts.
-- ============================================================

-- Seed các vật phẩm mới
INSERT INTO items (id,name,description,price,type,effect_type,effect_value,effect_duration_hours,shop_hidden) VALUES
 ('banh_su_kem','Bánh Su Kem Gekka','Bánh su kem ngọt ngào phủ socola. Hồi 150 năng lượng.',3000,'consumable','energy',150,1,false),
 ('banh_flan','Bánh Flan Caramel Gekka','Bánh flan mềm mịn thơm béo ngậy. Hồi 250 năng lượng.',6000,'consumable','energy',250,1,false),
 ('ca_ngon','Cá Ngon','Cá đánh bắt được từ /fish — dùng làm nhân bánh ngọt/mặn tại tiệm Gekka.',1000,'material','none',0,1,true),
 ('ca_hiem','Cá Hiếm','Cá hiếm câu được từ đại dương — nguyên liệu nướng bánh đặc biệt siêu cấp.',3000,'material','none',0,1,true),
 ('bo_hoa','Bó Hoa Tươi','Bó hoa tươi tắn làm quà tặng cho người khác hoặc Waguri.',2000,'material','none',0,1,false),
 ('hop_qua','Hộp Quà Gekka','Hộp quà Gekka tinh tế dùng để tặng hoặc làm nguyên liệu.',4000,'material','none',0,1,false),
 ('gau_bong','Gấu Bông Waguri','Gấu bông hình thỏ Waguri dễ thương vô cùng.',8000,'material','none',0,1,false)
ON CONFLICT (id) DO NOTHING;

-- RPC thu hoạch v2 có trừ lương nhân viên
CREATE OR REPLACE FUNCTION bakery_collect_v2(
    p_user_id TEXT,
    p_rate INT,
    p_cap BIGINT,
    p_cake_every BIGINT,
    p_wage_pct REAL
)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_stock BIGINT; v_last TIMESTAMPTZ; v_prog BIGINT;
        v_elapsed_min BIGINT; v_cap_min BIGINT; v_stock_min BIGINT; v_baked_min BIGINT;
        v_revenue BIGINT; v_wage BIGINT; v_net BIGINT; v_total BIGINT; v_cakes INT;
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
    v_wage    := round(v_revenue * p_wage_pct);
    v_net     := v_revenue - v_wage;

    v_total   := v_prog + v_revenue;
    v_cakes   := floor(v_total / p_cake_every);

    UPDATE bakeries SET
        stock           = stock - v_revenue,
        cake_progress   = v_total - v_cakes * p_cake_every,
        last_collect_at = v_last + (v_baked_min * interval '1 minute')
        WHERE user_id=p_user_id;
        
    UPDATE users SET wallet = wallet + v_net WHERE user_id=p_user_id;

    RETURN jsonb_build_object('result','ok','revenue',v_net,'wage_deducted',v_wage,'cakes',v_cakes,
        'stock_left', v_stock - v_revenue,
        'capped', (v_elapsed_min > v_cap_min AND v_cap_min <= v_stock_min));
END $$;

-- RPC thuê nhân viên
CREATE OR REPLACE FUNCTION bakery_hire(
    p_user_id TEXT,
    p_staff_id TEXT,
    p_cost BIGINT,
    p_max_staff INT
)
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_staff JSONB; v_wallet BIGINT; v_count INT;
BEGIN
    SELECT staff INTO v_staff FROM bakeries WHERE user_id=p_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN 'no_bakery'; END IF;
    
    -- Kiểm tra xem đã thuê chưa
    IF v_staff ? p_staff_id THEN RETURN 'already_hired'; END IF;
    
    -- Kiểm tra số lượng tối đa
    v_count := jsonb_array_length(v_staff);
    IF v_count >= p_max_staff THEN RETURN 'limit_reached'; END IF;
    
    -- Kiểm tra tiền ví
    SELECT wallet INTO v_wallet FROM users WHERE user_id=p_user_id FOR UPDATE;
    IF v_wallet < p_cost THEN RETURN 'poor'; END IF;
    
    -- Trừ tiền và thêm nhân viên
    UPDATE users SET wallet = wallet - p_cost WHERE user_id=p_user_id;
    UPDATE bakeries SET staff = staff || jsonb_build_array(p_staff_id) WHERE user_id=p_user_id;
    
    RETURN 'ok';
END $$;

-- RPC sa thải nhân viên
CREATE OR REPLACE FUNCTION bakery_fire(
    p_user_id TEXT,
    p_staff_id TEXT
)
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_staff JSONB; v_new_staff JSONB;
BEGIN
    SELECT staff INTO v_staff FROM bakeries WHERE user_id=p_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN 'no_bakery'; END IF;
    
    IF NOT (v_staff ? p_staff_id) THEN RETURN 'not_hired'; END IF;
    
    -- Xóa nhân viên khỏi mảng JSONB
    SELECT jsonb_agg(elem) INTO v_new_staff
    FROM jsonb_array_elements(v_staff) elem
    WHERE elem ->> 0 != p_staff_id;
    
    IF v_new_staff IS NULL THEN
        v_new_staff := '[]'::jsonb;
    END IF;
    
    UPDATE bakeries SET staff = v_new_staff WHERE user_id=p_user_id;
    RETURN 'ok';
END $$;

-- RPC trang trí tiệm
CREATE OR REPLACE FUNCTION bakery_decorate(
    p_user_id TEXT,
    p_item_id TEXT
)
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_qty INT;
BEGIN
    IF NOT EXISTS(SELECT 1 FROM bakeries WHERE user_id=p_user_id) THEN RETURN 'no_bakery'; END IF;
    
    -- Kiểm tra vật phẩm trong kho đồ
    SELECT quantity INTO v_qty FROM inventory WHERE user_id=p_user_id AND item_id=p_item_id FOR UPDATE;
    IF v_qty IS NULL OR v_qty < 1 THEN RETURN 'no_item'; END IF;
    
    -- Trừ vật phẩm
    UPDATE inventory SET quantity = quantity - 1 WHERE user_id=p_user_id AND item_id=p_item_id;
    DELETE FROM inventory WHERE user_id=p_user_id AND item_id=p_item_id AND quantity <= 0;
    
    -- Thêm vào mảng decor của tiệm bánh
    UPDATE bakeries SET decor = decor || jsonb_build_array(p_item_id) WHERE user_id=p_user_id;
    
    RETURN 'ok';
END $$;

-- Phân quyền
REVOKE EXECUTE ON FUNCTION bakery_collect_v2(TEXT,INT,BIGINT,BIGINT,REAL) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION bakery_hire(TEXT,TEXT,BIGINT,INT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION bakery_fire(TEXT,TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION bakery_decorate(TEXT,TEXT) FROM anon, authenticated;

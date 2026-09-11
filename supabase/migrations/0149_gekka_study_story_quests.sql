-- ============================================================
-- 0149_gekka_study_story_quests.sql
-- Đại tu vòng lặp gameplay:
-- 1. Cập nhật Bánh Gekka (banh_kem_dau, banh_cheesecake) & consume_item đa hiệu ứng
-- 2. Thêm vật phẩm Tiệm Tri Thức & bảng study_shop_catalog + RPC buy_study_shop_item
-- 3. Thêm cột tiến trình Cốt truyện (Hồi ký Kikyo) & RPC advance_story_node
-- 4. Chốt chặn an toàn chuyển tiền guard_pay_transfer (chống clone farm tiền)
-- ============================================================

-- 1. CẬP NHẬT TÊN & HIỆU ỨNG BÁNH GEKKA TRONG BẢNG ITEMS
UPDATE public.items
SET name = 'Bánh Kem Dâu Gekka',
    description = 'Bánh kem dâu ngọt ngào từ tiệm Gekka. Hồi +50 Năng Lượng và tăng +15% thu nhập trong 1 giờ.',
    type = 'consumable',
    effect_type = 'energy_buff',
    effect_value = 50,
    effect_duration_hours = 1
WHERE id = 'banh_kem_dau';

UPDATE public.items
SET name = 'Bánh Cheesecake Gekka',
    description = 'Bánh phô mai béo ngậy từ tiệm Gekka. Hồi đầy 100% Năng Lượng và tăng +20% thu nhập trong 2 giờ.',
    type = 'consumable',
    effect_type = 'energy_buff',
    effect_value = 100,
    effect_duration_hours = 2
WHERE id = 'banh_cheesecake';

-- Cập nhật consume_item đầy đủ 4 nhánh (energy, buff, health, energy_buff)
CREATE OR REPLACE FUNCTION public.consume_item(p_user_id TEXT, p_item_id TEXT)
RETURNS TEXT LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE 
    v_type TEXT; v_val INT; v_dur INT; v_qty INT; v_cur INT; v_prestige INT; v_max INT;
BEGIN
    SELECT effect_type, effect_value, COALESCE(effect_duration_hours, 1)
    INTO v_type, v_val, v_dur
    FROM public.items
    WHERE id = p_item_id;

    IF NOT FOUND THEN RETURN 'no_item'; END IF;
    IF v_type IS NULL OR v_type = 'none' THEN RETURN 'not_consumable'; END IF;

    SELECT quantity INTO v_qty FROM public.inventory WHERE user_id = p_user_id AND item_id = p_item_id FOR UPDATE;
    IF v_qty IS NULL OR v_qty < 1 THEN RETURN 'no_have'; END IF;

    UPDATE public.inventory SET quantity = quantity - 1 WHERE user_id = p_user_id AND item_id = p_item_id;
    DELETE FROM public.inventory WHERE user_id = p_user_id AND item_id = p_item_id AND quantity <= 0;

    IF v_type = 'energy' THEN
        v_cur := regen_energy(p_user_id);
        SELECT prestige INTO v_prestige FROM public.users WHERE user_id = p_user_id FOR UPDATE;
        v_max := 100 + COALESCE(v_prestige, 0) * 5;

        UPDATE public.users SET
            energy = least(v_max, v_cur + v_val),
            energy_updated_at = case when v_cur + v_val >= v_max then now() else energy_updated_at end
            WHERE user_id = p_user_id;

    ELSIF v_type = 'buff' THEN
        UPDATE public.users SET
            buff_mult = 1 + (v_val::real / 100),
            buff_expires_at = now() + make_interval(hours => v_dur)
            WHERE user_id = p_user_id;

    ELSIF v_type = 'health' THEN
        UPDATE public.users SET
            health = least(100, coalesce(health, 100) + v_val)
            WHERE user_id = p_user_id;

    ELSIF v_type = 'energy_buff' THEN
        v_cur := regen_energy(p_user_id);
        SELECT prestige INTO v_prestige FROM public.users WHERE user_id = p_user_id FOR UPDATE;
        v_max := 100 + COALESCE(v_prestige, 0) * 5;

        UPDATE public.users SET
            energy = least(v_max, v_cur + v_val),
            energy_updated_at = case when v_cur + v_val >= v_max then now() else energy_updated_at end,
            buff_mult = case when p_item_id = 'banh_kem_dau' then 1.15 else 1.20 end,
            buff_expires_at = now() + make_interval(hours => v_dur)
            WHERE user_id = p_user_id;
    END IF;

    RETURN 'ok';
END; $$;

REVOKE EXECUTE ON FUNCTION public.consume_item(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_item(TEXT, TEXT) TO service_role;

-- 2. VẬT PHẨM TIỆM TRI THỨC & BẢNG STUDY_SHOP_CATALOG
INSERT INTO public.items (id, name, description, price, type, effect_type, effect_value, effect_duration_hours, shop_hidden, category, rarity)
VALUES
    ('tra_lofi', 'Trà Lofi Waguri', 'Tách trà thảo mộc thơm lành. Uống trước khi học tăng +30% Xu và EXP Pomodoro.', 1500, 'consumable', 'study_buff', 30, 2, false, 'study', 'common'),
    ('men_no_co_truyen', 'Men Nở Cổ Truyền', 'Men nở gia truyền tiệm Gekka. Rút ngắn 50% thời gian nướng mẻ bánh tiếp theo.', 5000, 'material', 'none', 0, 0, false, 'study', 'uncommon'),
    ('bot_ngu_coc_pet', 'Ngũ Cốc Thảo Dược Pet', 'Thức ăn dinh dưỡng cho Thú Cưng, hồi 100% no và tăng tỉ lệ nhặt quà.', 3000, 'consumable', 'pet_food', 100, 1, false, 'study', 'common'),
    ('so_tay_ngu_nghiep', 'Sổ Tay Ngư Nghiệp', 'Bí kíp câu cá cổ xưa, tăng vĩnh viễn +10% tỉ lệ bắt được cá hiếm khi /fish.', 15000, 'tool', 'passive_fish', 10, 0, false, 'study', 'rare'),
    ('bi_pho_dia_chat', 'Bí Phổ Địa Chất', 'Sổ tay địa chất mỏ Kikyo, tăng vĩnh viễn +10% tỉ lệ đào quặng hiếm khi /mine.', 15000, 'tool', 'passive_mine', 10, 0, false, 'study', 'rare'),
    ('sach_tam_tri', 'Sách Tâm Trí Thú Cưng', 'Khai sáng linh thú: Ban ngay +1 Điểm Kỹ Năng cho Thú Cưng (skill_points).', 20000, 'consumable', 'pet_skill_point', 1, 0, false, 'study', 'rare'),
    ('tui_lua_mach_kikyo', 'Túi Lúa Mạch Kikyo', 'Hạt giống thượng hạng trồng tại /farm. Dùng làm bột mì nướng bánh cao cấp.', 4000, 'seed', 'none', 0, 0, false, 'study', 'uncommon'),
    ('khay_nuong_hoang_kim', 'Khay Nướng Hoàng Kim', 'Nâng cấp lò nướng: Tăng vĩnh viễn sức chứa khay nướng Tiệm Gekka từ 5 lên 10 bánh.', 50000, 'tool', 'bakery_expand', 5, 0, false, 'study', 'epic'),
    ('kinh_tri_thuc', 'Kính Tri Thức Kikyo', 'Cổ vật lưu niệm Album: Giảm 5% phí sàn giao dịch Chợ Nông Thủy Sản (/market).', 80000, 'collectible', 'market_discount', 5, 0, false, 'study', 'epic'),
    ('title_dai_hoc_si', 'Danh Hiệu Đại Học Sĩ', 'Danh hiệu vinh danh học giả kiên trì nhất học viện Kikyo: [🎓 Đại Học Sĩ].', 100000, 'badge', 'title', 0, 0, false, 'study', 'legendary')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    type = EXCLUDED.type,
    effect_type = EXCLUDED.effect_type,
    effect_value = EXCLUDED.effect_value,
    effect_duration_hours = EXCLUDED.effect_duration_hours,
    category = EXCLUDED.category,
    rarity = EXCLUDED.rarity;

CREATE TABLE IF NOT EXISTS public.study_shop_catalog (
    id TEXT PRIMARY KEY REFERENCES public.items(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    cost_points INT NOT NULL CHECK (cost_points > 0),
    tier INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.study_shop_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on study_shop_catalog" ON public.study_shop_catalog;
CREATE POLICY "Allow public read on study_shop_catalog"
ON public.study_shop_catalog FOR SELECT
TO anon, authenticated, service_role
USING (true);

DROP POLICY IF EXISTS "Allow service_role write on study_shop_catalog" ON public.study_shop_catalog;
CREATE POLICY "Allow service_role write on study_shop_catalog"
ON public.study_shop_catalog FOR ALL
TO service_role
USING (true);

INSERT INTO public.study_shop_catalog (id, cost_points, tier)
VALUES
    ('tra_lofi', 15, 1),
    ('bot_ngu_coc_pet', 20, 1),
    ('men_no_co_truyen', 25, 1),
    ('tui_lua_mach_kikyo', 40, 2),
    ('so_tay_ngu_nghiep', 60, 2),
    ('bi_pho_dia_chat', 60, 2),
    ('sach_tam_tri', 75, 2),
    ('khay_nuong_hoang_kim', 150, 3),
    ('kinh_tri_thuc', 200, 3),
    ('title_dai_hoc_si', 250, 3)
ON CONFLICT (id) DO UPDATE SET
    cost_points = EXCLUDED.cost_points,
    tier = EXCLUDED.tier;

-- RPC Mua Đồ Tiệm Tri Thức (Atomic)
CREATE OR REPLACE FUNCTION public.buy_study_shop_item(p_user_id TEXT, p_item_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_points INT;
    v_cost INT;
    v_item_name TEXT;
BEGIN
    SELECT cost_points INTO v_cost
    FROM public.study_shop_catalog
    WHERE id = p_item_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'item_not_in_shop');
    END IF;

    SELECT study_points INTO v_points
    FROM public.users
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
    END IF;

    IF COALESCE(v_points, 0) < v_cost THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'insufficient_points',
            'current_points', COALESCE(v_points, 0),
            'cost', v_cost
        );
    END IF;

    UPDATE public.users
    SET study_points = study_points - v_cost
    WHERE user_id = p_user_id;

    INSERT INTO public.inventory (user_id, item_id, quantity)
    VALUES (p_user_id, p_item_id, 1)
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = inventory.quantity + 1;

    SELECT name INTO v_item_name FROM public.items WHERE id = p_item_id;

    RETURN jsonb_build_object(
        'success', true,
        'item_id', p_item_id,
        'item_name', v_item_name,
        'cost', v_cost,
        'remaining_points', v_points - v_cost
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.buy_study_shop_item(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buy_study_shop_item(TEXT, TEXT) TO service_role;

-- 3. CỘT CỐT TRUYỆN TRÊN USERS & RPC ADVANCE_STORY_NODE
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS story_chapter INT DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS story_node INT DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS story_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS affection_points INT DEFAULT 0;

CREATE OR REPLACE FUNCTION public.advance_story_node(
    p_user_id TEXT,
    p_chapter INT,
    p_node INT,
    p_reward_coins BIGINT,
    p_reward_exp BIGINT,
    p_reward_item TEXT,
    p_affection_gain INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cur_ch INT;
    v_cur_nd INT;
    v_story_data JSONB;
BEGIN
    SELECT COALESCE(story_chapter, 1), COALESCE(story_node, 1), COALESCE(story_data, '{}'::jsonb)
    INTO v_cur_ch, v_cur_nd, v_story_data
    FROM public.users
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
    END IF;

    IF v_cur_ch != p_chapter OR v_cur_nd != p_node THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'step_mismatch',
            'current_chapter', v_cur_ch,
            'current_node', v_cur_nd
        );
    END IF;

    IF v_cur_nd >= 4 THEN
        v_cur_ch := v_cur_ch + 1;
        v_cur_nd := 1;
    ELSE
        v_cur_nd := v_cur_nd + 1;
    END IF;

    UPDATE public.users
    SET story_chapter = v_cur_ch,
        story_node = v_cur_nd,
        wallet = wallet + COALESCE(p_reward_coins, 0),
        exp = exp + COALESCE(p_reward_exp, 0),
        affection_points = COALESCE(affection_points, 0) + COALESCE(p_affection_gain, 0)
    WHERE user_id = p_user_id;

    IF p_reward_item IS NOT NULL AND p_reward_item != '' THEN
        INSERT INTO public.inventory (user_id, item_id, quantity)
        VALUES (p_user_id, p_reward_item, 1)
        ON CONFLICT (user_id, item_id)
        DO UPDATE SET quantity = inventory.quantity + 1;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'new_chapter', v_cur_ch,
        'new_node', v_cur_nd,
        'reward_coins', p_reward_coins,
        'reward_exp', p_reward_exp,
        'reward_item', p_reward_item,
        'affection_gain', p_affection_gain
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.advance_story_node(TEXT, INT, INT, BIGINT, BIGINT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_story_node(TEXT, INT, INT, BIGINT, BIGINT, TEXT, INT) TO service_role;

-- 4. CHỐT CHẶN AN TOÀN CHUYỂN TIỀN (ANTI-SYBIL GUARDRAIL)
CREATE OR REPLACE FUNCTION public.guard_pay_transfer(p_sender_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_exp BIGINT;
    v_chapter INT;
    v_level INT;
BEGIN
    SELECT exp, COALESCE(story_chapter, 1) INTO v_exp, v_chapter
    FROM public.users
    WHERE user_id = p_sender_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('allowed', false, 'error', 'user_not_found');
    END IF;

    v_level := floor(sqrt(coalesce(v_exp, 0)::numeric / 100)) + 1;

    IF v_level < 5 AND v_chapter < 4 THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'error', 'locked_newbie',
            'current_level', v_level,
            'required_level', 5,
            'current_chapter', v_chapter,
            'required_chapter', 4
        );
    END IF;

    RETURN jsonb_build_object('allowed', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_pay_transfer(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_pay_transfer(TEXT) TO service_role;

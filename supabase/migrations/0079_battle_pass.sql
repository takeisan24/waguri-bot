-- 0079_battle_pass.sql
-- Triển khai hệ thống Battle Pass theo mùa (Sổ Sứ Mệnh) gồm bảng lưu trữ và các RPC nguyên tử.

-- 1. Tạo bảng battle_pass_users
CREATE TABLE IF NOT EXISTS public.battle_pass_users (
    user_id TEXT REFERENCES public.users(user_id) ON DELETE CASCADE,
    season_id TEXT NOT NULL,
    xp INTEGER DEFAULT 0 NOT NULL,
    is_premium BOOLEAN DEFAULT FALSE NOT NULL,
    claimed_free INTEGER[] DEFAULT '{}' NOT NULL,
    claimed_premium INTEGER[] DEFAULT '{}' NOT NULL,
    daily_ai_xp_sum INTEGER DEFAULT 0 NOT NULL,     -- Giới hạn XP chat AI hàng ngày
    last_ai_xp_date DATE DEFAULT CURRENT_DATE NOT NULL, -- Ngày cập nhật XP chat AI gần nhất
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, season_id)
);

-- Bật RLS cho battle_pass_users
ALTER TABLE public.battle_pass_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cho phép đọc mọi lúc" ON public.battle_pass_users FOR SELECT USING (true);
CREATE POLICY "Cho phép service_role ghi/xóa" ON public.battle_pass_users FOR ALL USING (true) WITH CHECK (true);

-- 2. RPC add_pass_xp: Cộng điểm nguyên tử và trả về thông tin lên cấp
CREATE OR REPLACE FUNCTION public.add_pass_xp(
    p_user_id TEXT,
    p_season_id TEXT,
    p_xp_amount INTEGER,
    p_xp_per_level INTEGER
) RETURNS TABLE (
    xp INTEGER,
    is_premium BOOLEAN,
    old_level INTEGER,
    new_level INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_xp INTEGER;
    v_new_xp INTEGER;
    v_old_lvl INTEGER;
    v_new_lvl INTEGER;
    v_premium BOOLEAN;
BEGIN
    -- Lấy thông tin hiện tại hoặc tạo mới
    INSERT INTO battle_pass_users (user_id, season_id)
    VALUES (p_user_id, p_season_id)
    ON CONFLICT (user_id, season_id) DO NOTHING;

    SELECT b.xp, b.is_premium INTO v_old_xp, v_premium FROM battle_pass_users b WHERE b.user_id = p_user_id AND b.season_id = p_season_id FOR UPDATE;
    
    v_old_lvl := COALESCE(v_old_xp / p_xp_per_level, 0);
    v_new_xp := v_old_xp + p_xp_amount;
    -- Giới hạn tối đa cấp 20 (20,000 XP)
    IF v_new_xp > (20 * p_xp_per_level) THEN
        v_new_xp := 20 * p_xp_per_level;
    END IF;
    v_new_lvl := v_new_xp / p_xp_per_level;

    UPDATE battle_pass_users 
    SET xp = v_new_xp, updated_at = NOW() 
    WHERE user_id = p_user_id AND season_id = p_season_id;

    RETURN QUERY SELECT v_new_xp, v_premium, v_old_lvl, v_new_lvl;
END;
$$;

-- Phân quyền RPC add_pass_xp
REVOKE ALL ON FUNCTION public.add_pass_xp(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_pass_xp(TEXT, TEXT, INTEGER, INTEGER) TO service_role;


-- 3. RPC claim_pass_rewards_bulk: Nhận quà Sổ Sứ Mệnh hàng loạt nguyên tử
CREATE OR REPLACE FUNCTION public.claim_pass_rewards_bulk(
    p_user_id TEXT,
    p_season_id TEXT,
    p_free_levels INTEGER[],
    p_premium_levels INTEGER[],
    p_reward_coins BIGINT,
    p_reward_items JSONB, -- Mảng JSONB dạng: [{"id": "item_id", "qty": 1}]
    p_reward_title TEXT,
    p_xp_per_level INTEGER
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_xp INTEGER;
    v_premium BOOLEAN;
    v_item RECORD;
    v_level INTEGER;
BEGIN
    -- 1. Khóa dòng user (chống race condition)
    PERFORM 1 FROM users WHERE user_id = p_user_id FOR UPDATE;
    
    -- 2. Kiểm tra thông tin Sổ
    SELECT b.xp, b.is_premium INTO v_xp, v_premium FROM battle_pass_users b WHERE b.user_id = p_user_id AND b.season_id = p_season_id FOR UPDATE;
    IF v_xp IS NULL THEN
        RETURN 'pass_not_found';
    END IF;

    -- 3. Kiểm tra xem các level yêu cầu nhận đã hợp lệ chưa
    IF p_free_levels IS NOT NULL AND array_length(p_free_levels, 1) > 0 THEN
        FOREACH v_level IN ARRAY p_free_levels LOOP
            IF v_xp < (v_level * p_xp_per_level) THEN
                RETURN 'level_locked';
            END IF;
            IF EXISTS (SELECT 1 FROM battle_pass_users WHERE user_id = p_user_id AND season_id = p_season_id AND v_level = ANY(claimed_free)) THEN
                RETURN 'already_claimed';
            END IF;
        END LOOP;
    END IF;

    IF p_premium_levels IS NOT NULL AND array_length(p_premium_levels, 1) > 0 THEN
        IF NOT v_premium THEN
            RETURN 'premium_locked';
        END IF;
        FOREACH v_level IN ARRAY p_premium_levels LOOP
            IF v_xp < (v_level * p_xp_per_level) THEN
                RETURN 'level_locked';
            END IF;
            IF EXISTS (SELECT 1 FROM battle_pass_users WHERE user_id = p_user_id AND season_id = p_season_id AND v_level = ANY(claimed_premium)) THEN
                RETURN 'already_claimed';
            END IF;
        END LOOP;
    END IF;

    -- 4. Ghi nhận đã nhận quà (dùng CASE WHEN phòng hờ array_cat với NULL làm mất dữ liệu)
    UPDATE battle_pass_users
    SET claimed_free = CASE 
            WHEN p_free_levels IS NOT NULL AND array_length(p_free_levels, 1) > 0 
            THEN array_cat(claimed_free, p_free_levels) 
            ELSE claimed_free 
        END,
        claimed_premium = CASE 
            WHEN p_premium_levels IS NOT NULL AND array_length(p_premium_levels, 1) > 0 
            THEN array_cat(claimed_premium, p_premium_levels) 
            ELSE claimed_premium 
        END,
        updated_at = NOW()
    WHERE user_id = p_user_id AND season_id = p_season_id;

    -- 5. Cộng xu
    IF p_reward_coins > 0 THEN
        UPDATE users SET wallet = wallet + p_reward_coins WHERE user_id = p_user_id;
    END IF;

    -- 6. Cộng vật phẩm (Duyệt qua danh sách JSONB và upsert vào bảng inventory)
    IF p_reward_items IS NOT NULL AND jsonb_array_length(p_reward_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_reward_items) AS x(id TEXT, qty INT) LOOP
            IF v_item.qty > 0 THEN
                INSERT INTO inventory (user_id, item_id, quantity)
                VALUES (p_user_id, v_item.id, v_item.qty)
                ON CONFLICT (user_id, item_id)
                DO UPDATE SET quantity = inventory.quantity + excluded.quantity;
            END IF;
        END LOOP;
    END IF;

    -- 7. Cập danh hiệu
    IF p_reward_title IS NOT NULL AND p_reward_title <> '' THEN
        UPDATE users SET title = p_reward_title WHERE user_id = p_user_id;
    END IF;

    RETURN 'ok';
END;
$$;

-- Phân quyền RPC claim_pass_rewards_bulk
REVOKE ALL ON FUNCTION public.claim_pass_rewards_bulk(TEXT, TEXT, INTEGER[], INTEGER[], BIGINT, JSONB, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pass_rewards_bulk(TEXT, TEXT, INTEGER[], INTEGER[], BIGINT, JSONB, TEXT, INTEGER) TO service_role;


-- 4. RPC buy_premium_pass: Mua Sổ Sứ Mệnh Premium bằng xu ảo nguyên tử
CREATE OR REPLACE FUNCTION public.buy_premium_pass(
    p_user_id TEXT,
    p_season_id TEXT,
    p_cost BIGINT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet BIGINT;
    v_is_premium BOOLEAN;
BEGIN
    -- 1. Khóa dòng user
    SELECT wallet INTO v_wallet FROM users WHERE user_id = p_user_id FOR UPDATE;
    IF v_wallet IS NULL THEN
        RETURN 'user_not_found';
    END IF;

    -- 2. Kiểm tra số dư ví
    IF v_wallet < p_cost THEN
        RETURN 'insufficient_funds';
    END IF;

    -- 3. Kiểm tra trạng thái Premium Sổ hiện tại
    SELECT is_premium INTO v_is_premium FROM battle_pass_users WHERE user_id = p_user_id AND season_id = p_season_id FOR UPDATE;
    IF v_is_premium = TRUE THEN
        RETURN 'already_premium';
    END IF;

    -- 4. Tạo Sổ nếu chưa có, hoặc cập nhật
    INSERT INTO battle_pass_users (user_id, season_id, is_premium)
    VALUES (p_user_id, p_season_id, TRUE)
    ON CONFLICT (user_id, season_id) DO UPDATE SET is_premium = TRUE, updated_at = NOW();

    -- 5. Trừ tiền ví
    UPDATE users SET wallet = wallet - p_cost WHERE user_id = p_user_id;

    RETURN 'ok';
END;
$$;

-- Phân quyền RPC buy_premium_pass
REVOKE ALL ON FUNCTION public.buy_premium_pass(TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buy_premium_pass(TEXT, TEXT, BIGINT) TO service_role;

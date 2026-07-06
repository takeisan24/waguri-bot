-- 0079b_battle_pass_ai_xp.sql
-- Thêm RPC add_ai_chat_pass_xp có giới hạn quota hàng ngày cho cày XP qua chat AI.

CREATE OR REPLACE FUNCTION public.add_ai_chat_pass_xp(
    p_user_id TEXT,
    p_season_id TEXT,
    p_xp_amount INTEGER,
    p_xp_per_level INTEGER,
    p_max_daily_xp INTEGER
) RETURNS TABLE (
    success BOOLEAN,
    xp INTEGER,
    is_premium BOOLEAN,
    old_level INTEGER,
    new_level INTEGER,
    gained_xp INTEGER
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
    v_daily_sum INTEGER;
    v_daily_date DATE;
    v_to_add INTEGER;
BEGIN
    -- Lấy thông tin hiện tại hoặc tạo mới
    INSERT INTO battle_pass_users (user_id, season_id)
    VALUES (p_user_id, p_season_id)
    ON CONFLICT (user_id, season_id) DO NOTHING;

    SELECT b.xp, b.is_premium, b.daily_ai_xp_sum, b.last_ai_xp_date 
    INTO v_old_xp, v_premium, v_daily_sum, v_daily_date 
    FROM battle_pass_users b 
    WHERE b.user_id = p_user_id AND b.season_id = p_season_id FOR UPDATE;

    -- Kiểm tra ngày để reset giới hạn ngày
    IF v_daily_date < CURRENT_DATE THEN
        v_daily_sum := 0;
        v_daily_date := CURRENT_DATE;
    END IF;

    -- Kiểm tra xem đã đạt giới hạn chưa
    IF v_daily_sum >= p_max_daily_xp THEN
        RETURN QUERY SELECT FALSE, v_old_xp, v_premium, COALESCE(v_old_xp / p_xp_per_level, 0), COALESCE(v_old_xp / p_xp_per_level, 0), 0;
        RETURN;
    END IF;

    -- Tính số lượng XP thực tế được cộng
    v_to_add := p_xp_amount;
    IF v_daily_sum + v_to_add > p_max_daily_xp THEN
        v_to_add := p_max_daily_xp - v_daily_sum;
    END IF;

    v_old_lvl := COALESCE(v_old_xp / p_xp_per_level, 0);
    v_new_xp := v_old_xp + v_to_add;
    
    -- Giới hạn tối đa cấp 20 (20,000 XP)
    IF v_new_xp > (20 * p_xp_per_level) THEN
        v_new_xp := 20 * p_xp_per_level;
    END IF;
    v_new_lvl := v_new_xp / p_xp_per_level;

    UPDATE battle_pass_users 
    SET xp = v_new_xp, 
        daily_ai_xp_sum = v_daily_sum + v_to_add, 
        last_ai_xp_date = v_daily_date,
        updated_at = NOW() 
    WHERE user_id = p_user_id AND season_id = p_season_id;

    RETURN QUERY SELECT TRUE, v_new_xp, v_premium, v_old_lvl, v_new_lvl, v_to_add;
END;
$$;

-- Phân quyền RPC add_ai_chat_pass_xp
REVOKE ALL ON FUNCTION public.add_ai_chat_pass_xp(TEXT, TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_ai_chat_pass_xp(TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

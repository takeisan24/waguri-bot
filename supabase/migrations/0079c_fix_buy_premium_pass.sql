-- 0079c_fix_buy_premium_pass.sql
-- Hoán đổi thứ tự kiểm tra trong buy_premium_pass: kiểm tra xem đã có Premium chưa trước khi kiểm tra số dư ví.

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

    -- 2. Kiểm tra trạng thái Premium Sổ hiện tại TRƯỚC để tránh trả về lỗi thiếu tiền nếu đã mua rồi
    SELECT is_premium INTO v_is_premium FROM battle_pass_users WHERE user_id = p_user_id AND season_id = p_season_id FOR UPDATE;
    IF v_is_premium = TRUE THEN
        RETURN 'already_premium';
    END IF;

    -- 3. Kiểm tra số dư ví
    IF v_wallet < p_cost THEN
        RETURN 'insufficient_funds';
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

-- Phân quyền
REVOKE ALL ON FUNCTION public.buy_premium_pass(TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buy_premium_pass(TEXT, TEXT, BIGINT) TO service_role;

-- 0077_atomic_cosmetic_pet.sql
-- Gộp trừ tiền + cập nhật trạng thái vào 1 transaction nguyên tử.
-- Giải quyết race condition: crash giữa addMoney(-cost) và setCosmetic/feedPet
-- → người chơi mất tiền mà không nhận được dịch vụ.

-- ============================================================
-- 1. set_cosmetic_with_fee: trừ tiền + set title/profile_color
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_cosmetic_with_fee(
    p_user TEXT,
    p_field TEXT,      -- 'title' hoặc 'profile_color'
    p_value TEXT,
    p_cost  BIGINT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet BIGINT;
BEGIN
    -- Khoá dòng user (chống race)
    SELECT wallet INTO v_wallet FROM users WHERE user_id = p_user FOR UPDATE;
    IF v_wallet IS NULL OR v_wallet < p_cost THEN
        RETURN FALSE;
    END IF;

    UPDATE users SET wallet = wallet - p_cost WHERE user_id = p_user;

    IF p_field = 'title' THEN
        UPDATE users SET title = p_value WHERE user_id = p_user;
    ELSIF p_field = 'profile_color' THEN
        UPDATE users SET profile_color = p_value WHERE user_id = p_user;
    ELSE
        RAISE EXCEPTION 'Invalid cosmetic field: %', p_field;
    END IF;

    RETURN TRUE;
END;
$$;

-- ============================================================
-- 2. feed_pet_with_fee: trừ tiền + cộng pet exp (nguyên tử)
-- ============================================================
CREATE OR REPLACE FUNCTION public.feed_pet_with_fee(
    p_user TEXT,
    p_exp   INT,
    p_cost  BIGINT
) RETURNS BIGINT  -- trả exp mới, hoặc -1 nếu không đủ tiền, -2 nếu chưa có pet
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet BIGINT;
    v_new_exp BIGINT;
BEGIN
    -- Khoá dòng user (chống race)
    SELECT wallet INTO v_wallet FROM users WHERE user_id = p_user FOR UPDATE;
    IF v_wallet IS NULL OR v_wallet < p_cost THEN
        RETURN -1; -- không đủ tiền
    END IF;

    -- Kiểm tra pet tồn tại
    IF NOT EXISTS (SELECT 1 FROM pets WHERE user_id = p_user) THEN
        RETURN -2; -- chưa có pet
    END IF;

    -- Trừ tiền + cộng exp trong cùng transaction
    UPDATE users SET wallet = wallet - p_cost WHERE user_id = p_user;
    UPDATE pets SET exp = exp + p_exp WHERE user_id = p_user
        RETURNING exp INTO v_new_exp;

    RETURN v_new_exp;
END;
$$;

-- Phân quyền: chỉ service_role mới gọi được
REVOKE ALL ON FUNCTION public.set_cosmetic_with_fee(TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_cosmetic_with_fee(TEXT, TEXT, TEXT, BIGINT) TO service_role;

REVOKE ALL ON FUNCTION public.feed_pet_with_fee(TEXT, INT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feed_pet_with_fee(TEXT, INT, BIGINT) TO service_role;

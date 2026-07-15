-- ============================================================
-- 0085_support_role_rewards.sql — Thưởng vai trò theo cấp tại Server Support
-- ------------------------------------------------------------
-- Thêm cột claimed_support_gift và hàm RPC claim_support_gift
-- ============================================================

-- ---------- 1) Thêm cột vào bảng users ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS claimed_support_gift BOOLEAN NOT NULL DEFAULT false;

-- ---------- 2) Hàm RPC claim_support_gift ----------
CREATE OR REPLACE FUNCTION claim_support_gift(user_id_p TEXT, reward_coins_p BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    claimed BOOLEAN;
BEGIN
    -- Khóa dòng (Row Locking) để tránh race condition
    SELECT claimed_support_gift INTO claimed 
    FROM users 
    WHERE user_id = user_id_p 
    FOR UPDATE;

    IF COALESCE(claimed, false) = true THEN
        RETURN false;
    END IF;

    UPDATE users 
    SET claimed_support_gift = true, wallet = wallet + reward_coins_p
    WHERE user_id = user_id_p;

    RETURN true;
END;
$$;

-- ---------- 3) Bảo mật hàm RPC ----------
REVOKE EXECUTE ON FUNCTION claim_support_gift(TEXT, BIGINT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_support_gift(TEXT, BIGINT) TO service_role;

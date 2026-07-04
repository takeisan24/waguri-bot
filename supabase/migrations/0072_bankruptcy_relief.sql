-- ============================================================
-- 0072_bankruptcy_relief.sql — Trợ cấp phá sản khi hết sạch tiền
-- ============================================================

-- Thêm cột last_rescue_at vào bảng users
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_rescue_at TIMESTAMPTZ;

-- RPC nhận trợ cấp phá sản
CREATE OR REPLACE FUNCTION claim_bankruptcy_relief(p_user_id TEXT, p_amount BIGINT)
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_wallet BIGINT; v_bank BIGINT; v_last TIMESTAMPTZ;
BEGIN
    -- Đảm bảo user tồn tại
    INSERT INTO users(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    
    SELECT wallet, bank, last_rescue_at INTO v_wallet, v_bank, v_last FROM users WHERE user_id = p_user_id FOR UPDATE;
    
    -- Kiểm tra điều kiện phá sản (ví + bank phải bằng 0)
    IF v_wallet > 0 OR v_bank > 0 THEN
        RETURN 'not_bankrupt';
    END IF;
    
    -- Kiểm tra cooldown (mỗi 24 giờ một lần)
    IF v_last IS NOT NULL AND now() - v_last < INTERVAL '24 hours' THEN
        RETURN 'cooldown';
    END IF;
    
    -- Thực hiện trợ cấp
    UPDATE users SET wallet = wallet + p_amount, last_rescue_at = now() WHERE user_id = p_user_id;
    
    RETURN 'ok';
END $$;

-- Phân quyền
REVOKE EXECUTE ON FUNCTION claim_bankruptcy_relief(TEXT,BIGINT) FROM anon, authenticated;

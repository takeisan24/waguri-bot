-- ============================================================
-- 0073_affection_daily_cap.sql — Giới hạn thiện cảm nhận được mỗi ngày
-- ============================================================

-- Thêm các cột theo dõi giới hạn thiện cảm hằng ngày
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_affection_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_affection_sum INT NOT NULL DEFAULT 0;

-- RPC cộng thiện cảm có giới hạn theo ngày
CREATE OR REPLACE FUNCTION add_affection_v2(p_user_id TEXT, p_amount INT, p_daily_cap INT)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_current_date DATE := current_date;
        v_date DATE; v_sum INT; v_affection INT; v_added INT;
BEGIN
    -- Đảm bảo user tồn tại
    INSERT INTO users(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    
    SELECT last_affection_date, daily_affection_sum, affection INTO v_date, v_sum, v_affection 
        FROM users WHERE user_id = p_user_id FOR UPDATE;
        
    -- Nếu qua ngày mới, reset tổng cộng ngày
    IF v_date IS NULL OR v_date != v_current_date THEN
        v_date := v_current_date;
        v_sum := 0;
    END IF;
    
    -- Tính số lượng điểm có thể cộng thêm
    v_added := least(p_amount, p_daily_cap - v_sum);
    IF v_added < 0 THEN
        v_added := 0;
    END IF;
    
    -- Cập nhật nếu v_added > 0
    IF v_added > 0 THEN
        v_affection := v_affection + v_added;
        v_sum := v_sum + v_added;
        UPDATE users SET 
            affection = v_affection,
            last_affection_date = v_date,
            daily_affection_sum = v_sum
            WHERE user_id = p_user_id;
    END IF;
    
    RETURN jsonb_build_object(
        'affection', v_affection,
        'added', v_added,
        'capped', (v_sum >= p_daily_cap),
        'daily_sum', v_sum
    );
END $$;

-- Phân quyền
REVOKE EXECUTE ON FUNCTION add_affection_v2(TEXT,INT,INT) FROM anon, authenticated;

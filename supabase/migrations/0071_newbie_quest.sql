-- ============================================================
-- 0071_newbie_quest.sql — Chuỗi nhiệm vụ tân thủ 1 lần (5 bước)
-- ============================================================

-- Thêm cột vào bảng users
ALTER TABLE users ADD COLUMN IF NOT EXISTS newbie_step INT NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS newbie_progress INT NOT NULL DEFAULT 0;

-- RPC cập nhật tiến trình nhiệm vụ tân thủ
CREATE OR REPLACE FUNCTION newbie_quest_incr(p_user_id TEXT, p_key TEXT, p_amount INT)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_step INT; v_prog INT; v_wallet BIGINT; v_req INT; v_reward BIGINT;
        v_claimed BOOLEAN := FALSE; v_completed BOOLEAN := FALSE;
        v_bonus BIGINT := 5000;
BEGIN
    -- Đảm bảo user tồn tại
    INSERT INTO users(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    
    SELECT newbie_step, newbie_progress INTO v_step, v_prog FROM users WHERE user_id = p_user_id FOR UPDATE;
    
    -- Nếu đã hoàn thành toàn bộ chuỗi (step >= 6) thì không làm gì
    IF v_step >= 6 THEN
        RETURN jsonb_build_object('status', 'already_completed');
    END IF;
    
    -- Xác định yêu cầu và phần thưởng của từng bước
    IF v_step = 1 AND p_key = 'daily' THEN v_req := 1; v_reward := 1000;
    ELSIF v_step = 2 AND p_key = 'work' THEN v_req := 3; v_reward := 1500;
    ELSIF v_step = 3 AND p_key = 'buy' THEN v_req := 1; v_reward := 2000;
    ELSIF v_step = 4 AND p_key = 'apply_job' THEN v_req := 1; v_reward := 2500;
    ELSIF v_step = 5 AND p_key = 'gamble' THEN v_req := 1; v_reward := 3000;
    ELSE
        -- Key không khớp bước hiện tại
        RETURN jsonb_build_object('status', 'no_match', 'step', v_step, 'progress', v_prog);
    END IF;
    
    -- Tăng tiến trình
    v_prog := v_prog + p_amount;
    IF v_prog >= v_req THEN
        -- Hoàn thành bước hiện tại
        v_prog := 0;
        v_step := v_step + 1;
        v_claimed := TRUE;
        
        -- Cộng thưởng bước
        UPDATE users SET wallet = wallet + v_reward WHERE user_id = p_user_id;
        
        -- Nếu hoàn thành bước cuối cùng (bước 5)
        IF v_step = 6 THEN
            UPDATE users SET wallet = wallet + v_bonus, title = 'Tân Thủ Ngọt Ngào' WHERE user_id = p_user_id;
            v_completed := TRUE;
        END IF;
    END IF;
    
    -- Cập nhật DB
    UPDATE users SET newbie_step = v_step, newbie_progress = v_prog WHERE user_id = p_user_id;
    
    RETURN jsonb_build_object(
        'status', 'updated',
        'step', v_step,
        'progress', v_prog,
        'claimed', v_claimed,
        'reward', v_reward,
        'completed', v_completed,
        'bonus', v_bonus
    );
END $$;

-- Phân quyền
REVOKE EXECUTE ON FUNCTION newbie_quest_incr(TEXT,TEXT,INT) FROM anon, authenticated;

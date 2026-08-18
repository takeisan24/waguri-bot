-- ============================================================
-- 0124 — Đếm SỐ NGÀY người chơi có tương tác thiện cảm (chủ yếu là chat với Waguri).
--
-- VÌ SAO CẦN: câu hỏi quyết định của một bot bạn đồng hành là **"có ai quay lại vào một ngày
-- khác không"**. Hiện KHÔNG trả lời được. `users.affection` chỉ đếm TỔNG lượt, không có ngày;
-- `last_affection_date` chỉ giữ ngày CUỐI. Người có 29 điểm có thể đã chat 29 lần trong một
-- buổi, hoặc rải qua 29 ngày — hai chuyện nói lên những điều hoàn toàn khác nhau, mà ta không
-- phân biệt được.
--
-- Chuyện này không trừu tượng. Đo 2026-08-18: hai người dùng nhiều nhất từ trước tới nay
-- (29 và 14 lượt) đều bỏ đi cách đây 44–45 ngày. Không biết họ dùng dồn trong bao nhiêu ngày
-- thì không biết họ chán dần hay bỏ ngang.
--
-- Dự án này đã bốn lần kết luận sai vì tin vào cột đo lường hỏng (`last_seen` chỉ cập nhật ở
-- /daily; khoá `chat` trong daily_counters đếm tin nhắn Discord chứ không phải AI; khoá chính
-- daily_counters thiếu `day` nên không đo được giữ chân; `ai_used` reset lười). Cột này được
-- thêm để KHÔNG có lần thứ năm.
--
-- ĐẶT TÊN: `affection_days`, không phải `ai_days`. Trung thực — `add_affection_v2` còn được
-- gọi từ /date và /tangdo (quà). Hiện 0 người chơi có bạn đời nên thực tế nó là "số ngày chat
-- với AI", nhưng tên cột không nên hứa điều nó không bảo đảm.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS affection_days INT NOT NULL DEFAULT 0;

-- Backfill: ai đã có thiện cảm thì chắc chắn đã tương tác ÍT NHẤT một ngày. Đây là SÀN, không
-- phải lịch sử thật — lịch sử cũ không tồn tại và không thể dựng lại. Số liệu trước
-- 2026-08-18 vì thế chỉ dùng để so sánh tương đối, đừng coi là chính xác.
UPDATE users
   SET affection_days = 1
 WHERE coalesce(affection, 0) > 0 AND affection_days = 0;

-- Giữ nguyên toàn bộ logic cũ, CHỈ thêm phần đếm ngày.
CREATE OR REPLACE FUNCTION public.add_affection_v2(p_user_id text, p_amount integer, p_daily_cap integer)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_current_date DATE := current_date;
        v_date DATE; v_sum INT; v_affection INT; v_added INT;
        v_ngay_moi BOOLEAN;
BEGIN
    -- Đảm bảo user tồn tại
    INSERT INTO users(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;

    SELECT last_affection_date, daily_affection_sum, affection INTO v_date, v_sum, v_affection
        FROM users WHERE user_id = p_user_id FOR UPDATE;

    -- Phải chốt "có phải ngày mới không" TRƯỚC khi nhánh dưới ghi đè v_date.
    v_ngay_moi := (v_date IS NULL OR v_date != v_current_date);

    -- Nếu qua ngày mới, reset tổng cộng ngày
    IF v_ngay_moi THEN
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
            daily_affection_sum = v_sum,
            -- Chỉ tăng khi THỰC SỰ ghi được điểm trong một ngày mới. Người đã chạm trần ngày
            -- thì không ghi gì cả (nhánh này không chạy), nên không bị đếm oan thêm ngày.
            affection_days = coalesce(affection_days, 0) + CASE WHEN v_ngay_moi THEN 1 ELSE 0 END
            WHERE user_id = p_user_id;
    END IF;

    RETURN jsonb_build_object(
        'affection', v_affection,
        'added', v_added,
        'capped', (v_sum >= p_daily_cap),
        'daily_sum', v_sum
    );
END $function$;

REVOKE EXECUTE ON FUNCTION add_affection_v2(TEXT, INT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION add_affection_v2(TEXT, INT, INT) TO service_role;

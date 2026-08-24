-- Migration 0143: Phiên học tập trên WEB (/study) — nối trang web vào cùng hệ thưởng của bot.
--
-- BỐI CẢNH: trang /study trên web trước giờ thuần client, không ghi gì vào DB. Học xong không
-- được xu/streak/điểm nào, trong khi lệnh /study trên Discord thì cộng đủ. Người dùng học trên
-- web dễ tưởng mình đang tích luỹ.
--
-- VÌ SAO KHÔNG DÙNG LẠI `complete_study_session`: hàm đó nhận SỐ TIỀN THƯỞNG từ bên gọi
-- (p_earned_coins/p_earned_exp/p_study_points) và KHÔNG kiểm đã hết giờ hay chưa. Với bot thì
-- chấp nhận được vì chỉ tiến trình bot gọi, nhưng mở cho tầng web thì thành hai lỗ:
--   1) ai chạm được đường gọi là tự chọn số tiền thưởng cho mình;
--   2) bấm "hoàn thành" ngay giây đầu vẫn ăn đủ thưởng của phiên 120 phút.
-- Nên bộ hàm dưới đây TỰ TÍNH thưởng từ `duration_minutes` đã chốt lúc bắt đầu, và tự so
-- `now()` với `ends_at`. Bên gọi không có tham số nào để mặc cả.
--
-- CÔNG THỨC GIỮ ĐÚNG NHƯ BOT (src/lib/study.js): xu = phút×50, exp = phút×20, điểm = phút÷5.
-- Lệch công thức giữa hai cửa là tự mở đường kiếm lời bằng cách chọn cửa.

-- ============================================================
-- 1) BẮT ĐẦU PHIÊN
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_web_study_session(
    p_user_id TEXT,
    p_session_name TEXT,
    p_duration_minutes INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_duration INT;
    v_name TEXT;
    v_existing RECORD;
    v_new RECORD;
BEGIN
    IF p_user_id IS NULL OR p_user_id = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_user');
    END IF;

    -- Kẹp đúng biên của lệnh /study bên bot (15..120). Không tin số phút từ client.
    v_duration := LEAST(120, GREATEST(15, COALESCE(p_duration_minutes, 25)));
    v_name := COALESCE(NULLIF(TRIM(p_session_name), ''), 'Pomodoro Study');
    v_name := LEFT(v_name, 50);

    -- Dọn phiên bỏ hoang trước: người dùng đóng tab giữa chừng thì dòng ACTIVE nằm lại mãi và
    -- khoá luôn lần học sau. Quá hạn 30 phút so với ends_at coi như bỏ, KHÔNG thưởng.
    UPDATE public.user_study_sessions
       SET status = 'EARLY_EXIT'
     WHERE user_id = p_user_id
       AND status = 'ACTIVE'
       AND ends_at < now() - INTERVAL '30 minutes';

    -- Mỗi người một phiên tại một thời điểm — tính CẢ phiên mở từ Discord. Nếu không chặn thì
    -- mở song song nhiều phiên rồi hoàn thành hàng loạt là nhân thưởng.
    SELECT id, ends_at INTO v_existing
      FROM public.user_study_sessions
     WHERE user_id = p_user_id AND status = 'ACTIVE'
     ORDER BY id DESC
     LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 'error', 'already_active',
            'session_id', v_existing.id, 'ends_at', v_existing.ends_at
        );
    END IF;

    INSERT INTO public.user_study_sessions (user_id, guild_id, session_name, duration_minutes, ends_at, status)
    VALUES (p_user_id, 'WEB', v_name, v_duration, now() + make_interval(mins => v_duration), 'ACTIVE')
    RETURNING id, ends_at, duration_minutes INTO v_new;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_new.id,
        'ends_at', v_new.ends_at,
        'duration_minutes', v_new.duration_minutes
    );
END;
$$;

-- ============================================================
-- 2) TẠM DỪNG -> DỜI HẠN
-- ============================================================
-- Người dùng bấm tạm dừng thì đồng hồ máy chủ vẫn chạy, nên khi học tiếp phải DỜI `ends_at` ra
-- xa đúng bằng khoảng đã nghỉ. An toàn khi tin số giây do client báo: dời hạn chỉ làm phần
-- thưởng ĐẾN MUỘN HƠN, không có đường nào biến nó thành lợi. Vẫn kẹp trần để một lần gọi hỏng
-- không đẩy hạn đi hàng năm.
CREATE OR REPLACE FUNCTION public.extend_web_study_session(
    p_session_id BIGINT,
    p_user_id TEXT,
    p_add_seconds INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_add INT;
    v_ends TIMESTAMPTZ;
BEGIN
    v_add := LEAST(14400, GREATEST(0, COALESCE(p_add_seconds, 0)));  -- tối đa +4 giờ mỗi lần

    UPDATE public.user_study_sessions
       SET ends_at = ends_at + make_interval(secs => v_add)
     WHERE id = p_session_id
       AND user_id = p_user_id
       AND status = 'ACTIVE'
       -- Trần tuyệt đối: một phiên không thể kéo quá 24h kể từ lúc bắt đầu.
       AND ends_at + make_interval(secs => v_add) < started_at + INTERVAL '24 hours'
    RETURNING ends_at INTO v_ends;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_found_or_inactive');
    END IF;

    RETURN jsonb_build_object('success', true, 'ends_at', v_ends);
END;
$$;

-- ============================================================
-- 3) HOÀN THÀNH & TRAO THƯỞNG
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_web_study_session(
    p_session_id BIGINT,
    p_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session RECORD;
    v_coins BIGINT;
    v_exp BIGINT;
    v_points INT;
    v_last_date DATE;
    v_today DATE := CURRENT_DATE;
    v_streak INT := 1;
    v_updated INT;
BEGIN
    SELECT * INTO v_session
      FROM public.user_study_sessions
     WHERE id = p_session_id AND user_id = p_user_id AND status = 'ACTIVE'
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_found_or_inactive');
    END IF;

    -- CHỐT CHỐNG GIAN LẬN: phải thật sự hết giờ theo ĐỒNG HỒ MÁY CHỦ. Client có sửa Date.now
    -- hay gọi thẳng đường mạng cũng không rút ngắn được phiên.
    -- Nới 2 giây cho lệch đồng hồ/độ trễ mạng, không hơn.
    IF now() < v_session.ends_at - INTERVAL '2 seconds' THEN
        RETURN jsonb_build_object(
            'success', false, 'error', 'too_early',
            'seconds_left', CEIL(EXTRACT(EPOCH FROM (v_session.ends_at - now())))::INT
        );
    END IF;

    -- Chưa từng chơi bot -> không có dòng trong `users`, không có ví nào để cộng. PHẢI kiểm
    -- TRƯỚC KHI GHI: nếu để xuống dưới mới phát hiện thì phiên đã bị đánh COMPLETED rồi, người
    -- đó vừa mất phiên vừa không được thưởng và không có đường học lại. Trả về sớm thì phiên
    -- giữ nguyên ACTIVE, chơi bot xong quay lại bấm là nhận được.
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = p_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_game_account', 'minutes', v_session.duration_minutes);
    END IF;

    -- Thưởng TỰ TÍNH từ độ dài đã chốt lúc bắt đầu — bên gọi không truyền số nào vào đây.
    v_coins  := v_session.duration_minutes::BIGINT * 50;
    v_exp    := v_session.duration_minutes::BIGINT * 20;
    v_points := FLOOR(v_session.duration_minutes / 5.0)::INT;

    UPDATE public.user_study_sessions
       SET status = 'COMPLETED', earned_coins = v_coins, earned_exp = v_exp, study_points = v_points
     WHERE id = p_session_id;

    SELECT last_study_date, study_streak INTO v_last_date, v_streak
      FROM public.users WHERE user_id = p_user_id;

    IF v_last_date IS NULL THEN v_streak := 1;
    ELSIF v_last_date = v_today THEN v_streak := COALESCE(v_streak, 1);
    ELSIF v_last_date = v_today - INTERVAL '1 day' THEN v_streak := COALESCE(v_streak, 0) + 1;
    ELSE v_streak := 1;
    END IF;

    UPDATE public.users
       SET wallet = wallet + v_coins,
           exp = exp + v_exp,
           study_points = COALESCE(study_points, 0) + v_points,
           total_study_minutes = COALESCE(total_study_minutes, 0) + v_session.duration_minutes,
           study_streak = v_streak,
           last_study_date = v_today
     WHERE user_id = p_user_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    -- Chốt thừa: dòng `users` vừa kiểm ở trên mà giờ cộng không trúng dòng nào thì có gì đó rất
    -- sai (bị xoá xen giữa). Ném lỗi để CUỘN LẠI cả phiên — thà báo hỏng còn hơn đánh dấu đã
    -- học xong mà ví không nhận được gì (bài học 45d7c92: đừng báo thành công giả).
    IF v_updated = 0 THEN
        RAISE EXCEPTION 'complete_web_study_session: users row biến mất giữa chừng (user_id=%)', p_user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'new_streak', v_streak,
        'earned_coins', v_coins,
        'earned_exp', v_exp,
        'study_points', v_points,
        'minutes', v_session.duration_minutes
    );
END;
$$;

-- ============================================================
-- 4) HUỶ SỚM (không thưởng)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_web_study_session(
    p_session_id BIGINT,
    p_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id BIGINT;
BEGIN
    UPDATE public.user_study_sessions
       SET status = 'EARLY_EXIT'
     WHERE id = p_session_id AND user_id = p_user_id AND status = 'ACTIVE'
    RETURNING id INTO v_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_found_or_inactive');
    END IF;

    RETURN jsonb_build_object('success', true, 'session_id', v_id);
END;
$$;

-- ============================================================
-- QUYỀN: chỉ service_role. Theo bài học 0137/0138 — Postgres tự cấp EXECUTE cho PUBLIC nên
-- PHẢI thu hồi tường minh, nếu không 4 hàm này gọi được bằng khoá công khai (anon) = ai cũng
-- tự bơm xu cho mình.
-- ============================================================
REVOKE ALL ON FUNCTION public.start_web_study_session(TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.extend_web_study_session(BIGINT, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_web_study_session(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_web_study_session(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_web_study_session(TEXT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.extend_web_study_session(BIGINT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_web_study_session(BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_web_study_session(BIGINT, TEXT) TO service_role;

-- Tra phiên đang mở của một người (dùng khi mở lại tab): lọc theo user_id + status.
CREATE INDEX IF NOT EXISTS idx_study_sessions_user_active_ends
    ON public.user_study_sessions(user_id, status, ends_at);

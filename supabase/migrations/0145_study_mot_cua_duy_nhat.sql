-- Migration 0145: phiên học — MỘT CỬA DUY NHẤT cho cả bot lẫn web.
--
-- BỐI CẢNH (đo được, không phải suy đoán). Sau khi 0143 nối web vào hệ thưởng, chạy thử đúng
-- hàm thật của bot `db.startStudySession` trên DB test thì lộ ra ba lỗi:
--
--   1) BOT KHÔNG CHẶN. Bot chỉ canh bằng Map `activeSessions` trong RAM rồi INSERT thẳng, không
--      hỏi DB. Đang có phiên web mà gõ /study start -> tạo được dòng thứ hai:
--          số dòng ACTIVE của cùng một người: 2  [{id:10, guild:"1234..."}, {id:9, guild:"WEB"}]
--
--   2) NHÂN ĐÔI THƯỞNG. Hai phiên đó chồng lên cùng một khoảng thời gian, chốt cả hai:
--          ví 0 -> 1500 xu cho MỘT khoảng 15 phút (đáng lẽ 750).
--
--   3) CHẶN NHẦM NGƯỜI THẬT. Bot mở phiên 120 phút rồi restart -> timer trong RAM mất, dòng
--      ACTIVE nằm lại. Cách dọn cũ chỉ xoá dòng quá hạn >30 phút SO VỚI ends_at, mà ends_at còn
--      cách 118 phút, nên suốt ~148 phút sau đó người đó vào web bị báo "đang có phiên khác"
--      dù chẳng có gì đang chạy.
--
--   4) ĐUA TRANH (lỗi của chính 0143). Kiểu "SELECT xem có ACTIVE chưa -> rồi INSERT" là
--      kiểm-rồi-mới-làm. READ COMMITTED không khoá gì vì lúc SELECT chưa có dòng để khoá. Bắn
--      10 lời gọi đồng thời thì 2/3 lượt tạo được 2 dòng ACTIVE.
--
-- BA LỚP DƯỚI ĐÂY PHẢI ĐI CÙNG NHAU:
--   · CHỈ MỤC DUY NHẤT MỘT PHẦN -> bảo đảm tuyệt đối, DB vật lý không chứa nổi hai dòng. Đây là
--     thứ duy nhất bịt được đua tranh; kiểm-trước-khi-chèn chỉ là phép lịch sự để có thông báo đẹp.
--   · NHỊP TIM -> biết phiên còn sống hay đã bỏ, KHÔNG dựa vào ends_at. Thiếu nó thì chỉ mục
--     duy nhất biến lỗi (3) từ "thông báo thân thiện" thành "lỗi trùng khoá" — tệ hơn hiện tại.
--     Không dùng cách "bot khởi động thì quét sạch" vì bot chạy SHARDED (shard.js, totalShards
--     'auto'): một shard restart sẽ xoá phiên của người đang học trên shard khác.
--   · MỘT CỬA VÀO -> cả bot lẫn web đi qua `start_study_session_guarded`, hết cảnh mỗi cửa tự
--     canh một kiểu.

-- ============================================================
-- LỚP 1: nhịp tim
-- ============================================================
ALTER TABLE public.user_study_sessions
    ADD COLUMN IF NOT EXISTS last_beat_at TIMESTAMPTZ;

-- Dòng cũ chưa có nhịp -> lấy started_at làm mốc, đừng để NULL bị coi là "bỏ hoang" oan.
UPDATE public.user_study_sessions
   SET last_beat_at = COALESCE(last_beat_at, started_at, created_at, now())
 WHERE last_beat_at IS NULL;

ALTER TABLE public.user_study_sessions
    ALTER COLUMN last_beat_at SET DEFAULT now();

-- Ngưỡng bỏ hoang. Bot đập nhịp mỗi 30 giây (dùng luôn interval cập nhật embed đã có), web mỗi
-- 60 giây. 5 phút cho phép lỡ vài nhịp vì mạng chậm mà vẫn dọn nhanh hơn hẳn cách cũ.
CREATE OR REPLACE FUNCTION public.study_nguong_bo_hoang()
RETURNS INTERVAL LANGUAGE sql IMMUTABLE AS $$ SELECT INTERVAL '5 minutes' $$;

-- ============================================================
-- LỚP 2: chỉ mục duy nhất một phần — bảo đảm tuyệt đối
-- ============================================================
-- Dọn dữ liệu trùng có sẵn trước, nếu không lệnh tạo chỉ mục sẽ đổ. Giữ dòng MỚI NHẤT.
UPDATE public.user_study_sessions s
   SET status = 'EARLY_EXIT'
 WHERE s.status = 'ACTIVE'
   AND s.id < (SELECT MAX(s2.id) FROM public.user_study_sessions s2
                WHERE s2.user_id = s.user_id AND s2.status = 'ACTIVE');

CREATE UNIQUE INDEX IF NOT EXISTS uq_study_mot_phien_active
    ON public.user_study_sessions(user_id) WHERE status = 'ACTIVE';

-- ============================================================
-- LỚP 3: một cửa vào duy nhất
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_study_session_guarded(
    p_user_id TEXT,
    p_guild_id TEXT,
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

    v_duration := LEAST(120, GREATEST(15, COALESCE(p_duration_minutes, 25)));
    v_name := LEFT(COALESCE(NULLIF(TRIM(p_session_name), ''), 'Pomodoro Study'), 50);

    -- Dọn phiên BỎ HOANG theo nhịp tim, không theo ends_at. Đây là chỗ sửa lỗi (3): phiên bot
    -- 120 phút bị bỏ sau 2 phút vẫn được dọn sau 5 phút im lặng, thay vì chờ tới 148 phút.
    UPDATE public.user_study_sessions
       SET status = 'EARLY_EXIT'
     WHERE user_id = p_user_id
       AND status = 'ACTIVE'
       AND COALESCE(last_beat_at, started_at) < now() - public.study_nguong_bo_hoang();

    SELECT id, ends_at, guild_id INTO v_existing
      FROM public.user_study_sessions
     WHERE user_id = p_user_id AND status = 'ACTIVE'
     ORDER BY id DESC LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_active',
            'session_id', v_existing.id, 'ends_at', v_existing.ends_at, 'guild_id', v_existing.guild_id);
    END IF;

    -- Kiểm ở trên chỉ để có thông báo tử tế. Bảo đảm THẬT nằm ở chỉ mục duy nhất: hai lời gọi
    -- đồng thời cùng vượt qua kiểm tra thì đúng một cái chèn được, cái kia đâm vào trùng khoá
    -- và được đổi thành cùng một câu trả lời "đang có phiên khác".
    BEGIN
        INSERT INTO public.user_study_sessions
            (user_id, guild_id, session_name, duration_minutes, ends_at, status, last_beat_at)
        VALUES (p_user_id, COALESCE(NULLIF(p_guild_id, ''), 'WEB'), v_name, v_duration,
                now() + make_interval(mins => v_duration), 'ACTIVE', now())
        RETURNING id, ends_at, duration_minutes INTO v_new;
    EXCEPTION WHEN unique_violation THEN
        SELECT id, ends_at, guild_id INTO v_existing
          FROM public.user_study_sessions
         WHERE user_id = p_user_id AND status = 'ACTIVE'
         ORDER BY id DESC LIMIT 1;
        RETURN jsonb_build_object('success', false, 'error', 'already_active',
            'session_id', v_existing.id, 'ends_at', v_existing.ends_at, 'guild_id', v_existing.guild_id);
    END;

    RETURN jsonb_build_object('success', true, 'session_id', v_new.id,
        'ends_at', v_new.ends_at, 'duration_minutes', v_new.duration_minutes);
END;
$$;

-- Đập nhịp. Gọi định kỳ khi phiên còn sống — KỂ CẢ lúc đang tạm dừng, vì tạm dừng vẫn là đang giữ phiên.
CREATE OR REPLACE FUNCTION public.beat_study_session(
    p_session_id BIGINT,
    p_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id BIGINT;
BEGIN
    UPDATE public.user_study_sessions
       SET last_beat_at = now()
     WHERE id = p_session_id AND user_id = p_user_id AND status = 'ACTIVE'
    RETURNING id INTO v_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_found_or_inactive');
    END IF;
    RETURN jsonb_build_object('success', true);
END;
$$;

-- Cửa web nay chỉ là lớp mỏng gọi vào cửa chung — giữ nguyên tên & hình dạng trả về để
-- web/src/app/study/actions.ts không phải đổi.
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
BEGIN
    RETURN public.start_study_session_guarded(p_user_id, 'WEB', p_session_name, p_duration_minutes);
END;
$$;

-- ============================================================
-- QUYỀN: Postgres tự cấp EXECUTE cho PUBLIC -> phải thu hồi tường minh (bài học 0137/0138).
-- ============================================================
REVOKE ALL ON FUNCTION public.start_study_session_guarded(TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.beat_study_session(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_web_study_session(TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.study_nguong_bo_hoang() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_study_session_guarded(TEXT, TEXT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.beat_study_session(BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_web_study_session(TEXT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.study_nguong_bo_hoang() TO service_role;

CREATE INDEX IF NOT EXISTS idx_study_beat ON public.user_study_sessions(status, last_beat_at);

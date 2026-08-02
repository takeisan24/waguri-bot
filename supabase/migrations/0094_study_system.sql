-- Migration 0094: Study System (Pomodoro & Focus Tracking)
-- Idempotent setup for user_study_sessions table & study stats on users table

CREATE TABLE IF NOT EXISTS public.user_study_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    session_name TEXT DEFAULT 'Pomodoro Study',
    duration_minutes INT NOT NULL,
    earned_coins BIGINT DEFAULT 0,
    earned_exp BIGINT DEFAULT 0,
    study_points INT DEFAULT 0,
    status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'EARLY_EXIT')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_active ON public.user_study_sessions(user_id, status);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS study_streak INT DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_study_date DATE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_study_minutes BIGINT DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS study_points INT DEFAULT 0;

-- RPC Function for Atomic Study Completion
CREATE OR REPLACE FUNCTION public.complete_study_session(
    p_session_id BIGINT,
    p_user_id TEXT,
    p_earned_coins BIGINT,
    p_earned_exp BIGINT,
    p_study_points INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session RECORD;
    v_last_date DATE;
    v_today DATE := CURRENT_DATE;
    v_new_streak INT := 1;
BEGIN
    -- 1. Check session existence and state
    SELECT * INTO v_session
    FROM public.user_study_sessions
    WHERE id = p_session_id AND user_id = p_user_id AND status = 'ACTIVE'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_found_or_inactive');
    END IF;

    -- 2. Mark session completed
    UPDATE public.user_study_sessions
    SET status = 'COMPLETED',
        earned_coins = p_earned_coins,
        earned_exp = p_earned_exp,
        study_points = p_study_points
    WHERE id = p_session_id;

    -- 3. Calculate streak and update user stats
    SELECT last_study_date, study_streak INTO v_last_date, v_new_streak
    FROM public.users
    WHERE id = p_user_id;

    IF v_last_date IS NULL THEN
        v_new_streak := 1;
    ELSIF v_last_date = v_today THEN
        -- Already studied today, keep current streak
        v_new_streak := COALESCE(v_new_streak, 1);
    ELSIF v_last_date = v_today - INTERVAL '1 day' THEN
        -- Studied yesterday, increment streak
        v_new_streak := COALESCE(v_new_streak, 0) + 1;
    ELSE
        -- Streak broken
        v_new_streak := 1;
    END IF;

    -- 4. Atomically update user balance and study stats
    UPDATE public.users
    SET coins = coins + p_earned_coins,
        exp = exp + p_earned_exp,
        study_points = COALESCE(study_points, 0) + p_study_points,
        total_study_minutes = COALESCE(total_study_minutes, 0) + v_session.duration_minutes,
        study_streak = v_new_streak,
        last_study_date = v_today
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_streak', v_new_streak,
        'earned_coins', p_earned_coins,
        'earned_exp', p_earned_exp,
        'study_points', p_study_points
    );
END;
$$;

-- Secure RPC permissions
REVOKE EXECUTE ON FUNCTION public.complete_study_session(BIGINT, TEXT, BIGINT, BIGINT, INT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_study_session(BIGINT, TEXT, BIGINT, BIGINT, INT) TO service_role;

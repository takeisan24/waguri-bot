-- ============================================================
-- 0092_user_profile_names.sql — Lưu trữ & Trả về Username & Avatar thật cho Leaderboard
--
-- Thêm cột `username` và `avatar` vào bảng `users` để lưu tên hiển thị & ảnh đại diện
-- thật từ Discord. Cập nhật `leaderboard_rows` và `leaderboard_rows_guild` trả về
-- thông tin này cho Web hiển thị siêu tốc (0.02s) không cần chờ Bot API.
-- ============================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar TEXT;

DROP FUNCTION IF EXISTS public.leaderboard_rows(text, int);
DROP FUNCTION IF EXISTS public.leaderboard_rows_guild(text, int, text);

CREATE OR REPLACE FUNCTION public.leaderboard_rows(p_sort text, p_limit int)
RETURNS TABLE(user_id text, networth bigint, exp int, username text, avatar text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT user_id, (wallet + bank)::bigint AS networth, exp, COALESCE(username, 'Người chơi') AS username, avatar
    FROM public.users
    ORDER BY CASE WHEN p_sort = 'level' THEN exp::bigint ELSE (wallet + bank) END DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.leaderboard_rows_guild(p_sort text, p_limit int, p_guild text)
RETURNS TABLE(user_id text, networth bigint, exp int, username text, avatar text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT u.user_id, (u.wallet + u.bank)::bigint AS networth, u.exp, COALESCE(u.username, 'Người chơi') AS username, u.avatar
    FROM public.users u
    JOIN public.guild_members gm ON gm.user_id = u.user_id AND gm.guild_id = p_guild
    ORDER BY CASE WHEN p_sort = 'level' THEN u.exp::bigint ELSE (u.wallet + u.bank) END DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.leaderboard_rows(text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leaderboard_rows_guild(text, int, text) TO anon, authenticated, service_role;

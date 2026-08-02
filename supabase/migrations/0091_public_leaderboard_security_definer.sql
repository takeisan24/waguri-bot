-- ============================================================
-- 0091_public_leaderboard_security_definer.sql — Công khai quyền đọc Bảng xếp hạng
--
-- Cho phép công khai truy vấn dữ liệu Bảng xếp hạng (top tài sản, level & tiệm bánh)
-- thông qua RPC `leaderboard_rows`, `leaderboard_rows_guild` và `get_bakery_leaderboard`
-- ngay cả khi gọi bằng anon client (Client-side / Web Next.js / Vercel).
-- ============================================================

CREATE OR REPLACE FUNCTION public.leaderboard_rows(p_sort text, p_limit int)
RETURNS TABLE(user_id text, networth bigint, exp int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT user_id, (wallet + bank)::bigint AS networth, exp
    FROM public.users
    ORDER BY CASE WHEN p_sort = 'level' THEN exp::bigint ELSE (wallet + bank) END DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.leaderboard_rows_guild(p_sort text, p_limit int, p_guild text)
RETURNS TABLE(user_id text, networth bigint, exp int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT u.user_id, (u.wallet + u.bank)::bigint AS networth, u.exp
    FROM public.users u
    JOIN public.guild_members gm ON gm.user_id = u.user_id AND gm.guild_id = p_guild
    ORDER BY CASE WHEN p_sort = 'level' THEN u.exp::bigint ELSE (u.wallet + u.bank) END DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

-- Cấu hình SECURITY DEFINER cho get_bakery_leaderboard
ALTER FUNCTION public.get_bakery_leaderboard(INT, INT) SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.leaderboard_rows(text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leaderboard_rows_guild(text, int, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_bakery_leaderboard(int, int) TO anon, authenticated, service_role;

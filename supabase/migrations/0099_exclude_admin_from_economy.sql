-- ============================================================
-- 0099_exclude_admin_from_economy.sql
-- Tách tiền test của owner khỏi thống kê kinh tế & bảng xếp hạng.
--
-- VẤN ĐỀ: một tài khoản owner (dùng `/eco-admin addmoney` để test, ngày 2026-07-18)
-- đang giữ ~99 tỷ xu, trong khi TOÀN BỘ 258 người chơi còn lại cộng lại chỉ ~293.000 xu.
--   -> `economy_snapshots.total_supply` bị một dòng nuốt mất 99,0000% tín hiệu
--      => `/eco-admin report` KHÔNG thể phát hiện lạm phát hay exploit (đúng việc nó sinh ra để làm).
--   -> `richest`, `avg_supply` vô nghĩa.
--   -> BXH công khai (bot + web) hiện tài khoản test ở hạng #1 với 99 tỷ.
--   -> `user_wealth_rank` đẩy hạng của mọi người chơi thật xuống 1 bậc.
--
-- CÁCH SỬA: cờ `users.exclude_from_economy`. Cờ này KHÁC `profile_public`:
--   · profile_public = quyền riêng tư người chơi tự chọn.
--   · exclude_from_economy = "tài khoản này không phải người chơi thật" (owner/test/bot).
-- Gộp hai khái niệm vào một cột là sai — nên tách riêng.
--
-- KHÔNG hardcode Discord ID vào repo (repo PUBLIC). Bot tự đánh cờ lúc khởi động từ
-- biến môi trường OWNER_IDS — xem `db.syncAdminExclusions()` gọi trong src/events/ready.js.
--
-- LƯU Ý: các dòng `economy_snapshots` CŨ vẫn chứa số liệu bị nhiễm (giữ nguyên — luật
-- forward-only). Snapshot ĐẦU TIÊN sau khi áp sẽ tụt ~99 tỷ; đó là con số ĐÚNG, không phải lỗi.
--
-- Idempotent.
-- ============================================================

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS exclude_from_economy BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.exclude_from_economy IS
    'true = tài khoản vận hành (owner/test/bot), loại khỏi telemetry kinh tế + BXH. Bot tự đặt từ OWNER_IDS lúc khởi động.';

-- ------------------------------------------------------------
-- 1) TELEMETRY — chỉ đếm người chơi thật
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.snapshot_economy()
RETURNS economy_snapshots LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE r economy_snapshots;
BEGIN
    INSERT INTO economy_snapshots AS es
        (taken_on, total_wallet, total_bank, total_supply, user_count, active_7d, premium_count, richest, avg_supply, taken_at)
    SELECT current_date,
           coalesce(sum(wallet), 0),
           coalesce(sum(bank), 0),
           coalesce(sum(wallet + bank), 0),
           count(*),
           count(*) FILTER (WHERE last_seen > now() - interval '7 days'),
           count(*) FILTER (WHERE premium_until > now()),
           coalesce(max(wallet + bank), 0),
           coalesce((sum(wallet + bank) / nullif(count(*), 0))::bigint, 0),
           now()
    FROM users
    WHERE NOT coalesce(exclude_from_economy, false)   -- <-- loại tài khoản vận hành
    ON CONFLICT (taken_on) DO UPDATE SET
        total_wallet  = excluded.total_wallet,
        total_bank    = excluded.total_bank,
        total_supply  = excluded.total_supply,
        user_count    = excluded.user_count,
        active_7d     = excluded.active_7d,
        premium_count = excluded.premium_count,
        richest       = excluded.richest,
        avg_supply    = excluded.avg_supply,
        taken_at      = excluded.taken_at
    RETURNING es.* INTO r;
    RETURN r;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.snapshot_economy() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.snapshot_economy() TO service_role;

-- ------------------------------------------------------------
-- 2) HẠNG TÀI SẢN — không tính tài khoản vận hành khi đếm "số người giàu hơn"
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_wealth_rank(p_user text)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT (count(*) + 1)::int
    FROM public.users uu
    WHERE NOT coalesce(uu.exclude_from_economy, false)
      AND (uu.wallet + uu.bank) > (SELECT (wallet + bank) FROM public.users WHERE user_id = p_user);
$$;
GRANT EXECUTE ON FUNCTION public.user_wealth_rank(text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 3) BẢNG XẾP HẠNG — giữ nguyên bộ lọc profile_public của 0095, thêm bộ lọc mới
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leaderboard_rows(p_sort text, p_limit int)
RETURNS TABLE(user_id text, networth bigint, exp int, username text, avatar text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
    SELECT user_id, (wallet + bank)::bigint AS networth, exp,
           COALESCE(username, 'Người chơi') AS username, avatar
    FROM public.users
    WHERE COALESCE(profile_public, true)
      AND NOT COALESCE(exclude_from_economy, false)
    ORDER BY CASE WHEN p_sort = 'level' THEN exp::bigint ELSE (wallet + bank) END DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.leaderboard_rows_guild(p_sort text, p_limit int, p_guild text)
RETURNS TABLE(user_id text, networth bigint, exp int, username text, avatar text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
    SELECT u.user_id, (u.wallet + u.bank)::bigint AS networth, u.exp,
           COALESCE(u.username, 'Người chơi') AS username, u.avatar
    FROM public.users u
    JOIN public.guild_members gm ON gm.user_id = u.user_id AND gm.guild_id = p_guild
    WHERE COALESCE(u.profile_public, true)
      AND NOT COALESCE(u.exclude_from_economy, false)
    ORDER BY CASE WHEN p_sort = 'level' THEN u.exp::bigint ELSE (u.wallet + u.bank) END DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.leaderboard_rows(text, int)               TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leaderboard_rows_guild(text, int, text)   TO anon, authenticated, service_role;

-- ============================================================
-- VERIFY sau khi áp (bot khởi động lại một lần để đánh cờ từ OWNER_IDS):
--
-- SELECT user_id, username, wallet + bank AS tong, exclude_from_economy
-- FROM public.users ORDER BY wallet DESC LIMIT 5;
--   -> tài khoản owner phải có exclude_from_economy = true
--
-- SELECT * FROM public.leaderboard_rows('wealth', 5);
--   -> KHÔNG còn tài khoản 99 tỷ đứng đầu
--
-- SELECT * FROM public.snapshot_economy();
--   -> total_supply phải khoảng ~293.000 (kinh tế THẬT), không phải 99 tỷ
-- ============================================================

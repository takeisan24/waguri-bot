-- ============================================================
-- 0096_wealth_rank_and_bakery_privacy.sql — Bổ sung sau re-audit 2026-08-04
--
--  1) user_wealth_rank(text): trả HẠNG tài sản thật của 1 user (đếm số người giàu hơn + 1).
--     Web trước đây hardcode rank=0 (trang hồ sơ) và rank=1 ("hạng của bạn" ở BXH) trên đường
--     đọc DB nhanh -> ai cũng thấy #0 / #1. Mirror đúng biểu thức wealth_rank trong get_public_profile.
--  2) get_bakery_leaderboard: lọc theo profile_public (JOIN users). Trước đây BXH tiệm bánh + endpoint
--     /api/bakery/:id lộ tên/avatar Discord của cả user đã đặt hồ sơ ẩn — 0095 chỉ vá BXH wealth/level.
-- ============================================================

-- 1) HẠNG TÀI SẢN
CREATE OR REPLACE FUNCTION public.user_wealth_rank(p_user text)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT (count(*) + 1)::int
    FROM public.users uu
    WHERE (uu.wallet + uu.bank) > (SELECT (wallet + bank) FROM public.users WHERE user_id = p_user);
$$;
GRANT EXECUTE ON FUNCTION public.user_wealth_rank(text) TO anon, authenticated, service_role;

-- 2) BXH TIỆM BÁNH tôn trọng profile_public
CREATE OR REPLACE FUNCTION public.get_bakery_leaderboard(p_limit integer, p_offset integer)
RETURNS TABLE(user_id text, level integer, likes_count integer, bakery_score integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
    RETURN QUERY
    SELECT b.user_id, b.level, b.likes_count,
        (b.level * 1000 + b.likes_count * 50 + jsonb_array_length(b.staff) * 100)::INT AS bakery_score
    FROM public.bakeries b
    LEFT JOIN public.users u ON u.user_id = b.user_id
    WHERE COALESCE(u.profile_public, true)
    ORDER BY b.level DESC, b.likes_count DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

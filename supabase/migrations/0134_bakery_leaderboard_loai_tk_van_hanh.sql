-- ============================================================
-- 0134_bakery_leaderboard_loai_tk_van_hanh.sql
--
-- `get_bakery_leaderboard` là bảng xếp hạng DUY NHẤT không loại tài khoản vận hành, trong
-- khi `leaderboard_rows` và `leaderboard_rows_guild` đã loại từ 0099. Bất nhất này khiến
-- tài khoản của người vận hành sẽ đứng đầu bảng tiệm bánh ngay khi có ai mở tiệm.
--
-- Kèm luôn: thu quyền khỏi anon (0132 đã thu, giữ lại ở đây để CREATE OR REPLACE không
-- vô tình khôi phục quyền cũ — replace hàm KHÔNG reset grant, nhưng ghi lại cho chắc và
-- để đọc migration này là thấy đủ tư thế quyền).
--
-- Đây là nửa sau của một lỗi tìm ra ngày 2026-08-23 khi kiểm kê tầng web. Nửa đầu nằm ở
-- `web/src/app/api/leaderboard/route.ts`: route truy vấn THẲNG bảng `bakeries` và select
-- cột `bakery_score` — cột KHÔNG TỒN TẠI, vì điểm số được TÍNH trong hàm này. PostgREST
-- trả lỗi, mã lại chỉ lấy `data` mà bỏ `error`, nên bảng xếp hạng tiệm bánh luôn rỗng mà
-- không ai biết. Route nay gọi hàm này thay vì tự truy vấn.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_bakery_leaderboard(p_limit integer, p_offset integer)
RETURNS TABLE(user_id text, level integer, likes_count integer, bakery_score integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT b.user_id, b.level, b.likes_count,
        (b.level * 1000 + b.likes_count * 50 + jsonb_array_length(b.staff) * 100)::INT AS bakery_score
    FROM public.bakeries b
    LEFT JOIN public.users u ON u.user_id = b.user_id
    WHERE COALESCE(u.profile_public, true)
      AND NOT COALESCE(u.exclude_from_economy, false)
    ORDER BY b.level DESC, b.likes_count DESC
    LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_bakery_leaderboard(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_bakery_leaderboard(integer, integer) TO service_role;

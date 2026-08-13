-- ============================================================
-- 0103_reapply_table_grants_hardening.sql
-- Đóng 28 cảnh báo `pg_graphql_{anon,authenticated}_table_exposed` của Supabase advisor.
--
-- VÌ SAO HỞ: `0054` (bật RLS mọi bảng) và `0055` (revoke quyền bảng khỏi anon/authenticated)
-- đều dùng khối `DO` quét `pg_tables` — chạy ĐÚNG MỘT LẦN. Mọi bảng tạo SAU đó nhận lại
-- quyền mặc định của Supabase và thoát khỏi lưới:
--   auctions · bakeries · bakery_likes · battle_pass_users · clan_upgrades · confession_logs
--   economy_snapshots · tickets · user_badges · user_collection_rewards · user_discoveries
--   user_study_sessions · world_event_contributions · world_events
--
-- ĐÂY LÀ ĐÚNG LỚP LỖI của `0055` (search_path) mà `0102` vừa phải khôi phục, và của
-- `0095`/`0093` (hàm tạo sau không được pin). Hardening bằng khối DO một lần KHÔNG bền —
-- nó chỉ đúng tại thời điểm chạy. Vì vậy file này idempotent và NÊN chạy lại sau mỗi đợt
-- thêm bảng mới (hoặc tốt hơn: chạy `get_advisors` sau mỗi migration có DDL).
--
-- AN TOÀN — đã kiểm chứng trước khi siết (2026-08-13):
--   Toàn bộ truy vấn bảng game trên web đi qua `createAdminClient()` (service_role, bypass RLS).
--   Client anon/SSR (`lib/supabase/server.ts`) CHỈ dùng cho `auth.getUser()` — schema `auth`,
--   không đụng schema `public`. Bot dùng service_role. => Revoke KHÔNG làm hỏng đường nào.
--   Bảng xếp hạng công khai vẫn chạy vì `leaderboard_rows`/`user_wealth_rank`/
--   `get_bakery_leaderboard` là SECURITY DEFINER -> bỏ qua quyền bảng.
--
-- Idempotent.
-- ============================================================

-- 1) Bật RLS trên MỌI bảng public (bảng mới tạo sau 0054 có thể chưa bật)
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    END LOOP;
END $$;

-- 2) Gỡ quyền bảng khỏi anon/authenticated trên MỌI bảng public
--    (RLS đã chặn HÀNG; revoke gỡ luôn bảng khỏi schema GraphQL/PostgREST — phòng thủ nhiều lớp)
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', r.tablename);
    END LOOP;
END $$;

-- 3) service_role (bot + web admin client) giữ nguyên toàn quyền
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', r.tablename);
    END LOOP;
END $$;

-- ============================================================
-- VERIFY:
-- SELECT count(*) FROM information_schema.role_table_grants
-- WHERE table_schema='public' AND grantee IN ('anon','authenticated');
--   -> phải bằng 0
--
-- Rồi chạy lại advisor: `pg_graphql_*_table_exposed` phải về 0.
-- BXH web (/leaderboard) và /u/[id] vẫn phải hiển thị bình thường.
-- ============================================================

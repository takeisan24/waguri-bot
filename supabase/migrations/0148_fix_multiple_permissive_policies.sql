-- Migration 0148: Khắc phục multiple permissive policies trên 3 bảng
-- (battle_pass_users, user_collection_rewards, user_discoveries)
-- 
-- VẤN ĐỀ: Khi tạo policy "Cho phép service_role ghi/xóa", migration 0078 & 0079 không chỉ định "TO service_role",
-- khiến Postgres mặc định gán cho PUBLIC. Kết quả: với lệnh SELECT, Postgres phải thẩm định cả 2 policy:
-- "Cho phép đọc mọi lúc" (SELECT) và "Cho phép service_role ghi/xóa" (ALL) -> Supabase linter báo multiple_permissive_policies.
-- 
-- KHẮC PHỤC: Chỉ định rõ TO service_role cho policy ALL.

-- 1. user_discoveries
DROP POLICY IF EXISTS "Cho phép service_role ghi/xóa" ON public.user_discoveries;
CREATE POLICY "Cho phép service_role ghi/xóa" ON public.user_discoveries FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. user_collection_rewards
DROP POLICY IF EXISTS "Cho phép service_role ghi/xóa" ON public.user_collection_rewards;
CREATE POLICY "Cho phép service_role ghi/xóa" ON public.user_collection_rewards FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. battle_pass_users
DROP POLICY IF EXISTS "Cho phép service_role ghi/xóa" ON public.battle_pass_users;
CREATE POLICY "Cho phép service_role ghi/xóa" ON public.battle_pass_users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Migration 0147: Củng cố linter bảo mật & chỉ mục khóa ngoại (Hardening Linter & Foreign Key Indexes)
-- 
-- 1. Sửa hàm study_nguong_bo_hoang() để gán cứng search_path = public, pg_temp (xoá cảnh báo linter security).
-- 2. Tạo 5 covering index cho các khóa ngoại chưa có chỉ mục (auctions, inventory, user_discoveries, users).

-- ============================================================
-- 1. Bảo mật: search_path cho study_nguong_bo_hoang
-- ============================================================
CREATE OR REPLACE FUNCTION public.study_nguong_bo_hoang()
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT INTERVAL '5 minutes' $$;

-- Thu hồi quyền anon/authenticated, chỉ cấp cho service_role
REVOKE ALL ON FUNCTION public.study_nguong_bo_hoang() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.study_nguong_bo_hoang() TO service_role;

-- ============================================================
-- 2. Hiệu năng: Covering Indexes cho 5 Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_auctions_highest_bidder ON public.auctions(highest_bidder_id);
CREATE INDEX IF NOT EXISTS idx_auctions_seller ON public.auctions(seller_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item ON public.inventory(item_id);
CREATE INDEX IF NOT EXISTS idx_user_discoveries_item ON public.user_discoveries(item_id);
CREATE INDEX IF NOT EXISTS idx_users_job ON public.users(job_id);

-- ============================================================
-- 0025_cosmetics.sql — Cosmetic sink: danh hiệu + màu hồ sơ
-- ============================================================

alter table users add column if not exists title         text;
alter table users add column if not exists profile_color text;

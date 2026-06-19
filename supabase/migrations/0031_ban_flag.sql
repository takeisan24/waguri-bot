-- ============================================================
-- 0031_ban_flag.sql — Cờ chặn user khỏi dùng bot (chống phá)
-- ============================================================
alter table users add column if not exists banned boolean not null default false;

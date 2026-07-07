-- supabase/migrations/0080_user_locale.sql
-- Thêm cột locale vào bảng users để phục vụ đa ngôn ngữ.

ALTER TABLE users ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'vi';

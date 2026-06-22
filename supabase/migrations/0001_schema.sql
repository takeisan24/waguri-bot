-- ============================================================
-- 0001_schema.sql — TÀI LIỆU schema HIỆN CÓ (đã tồn tại sẵn trong project).
-- File này phản ánh ĐÚNG cấu trúc thật đang chạy (kiểm tra ngày 2026-06-16),
-- KHÔNG cần chạy lại (bảng đã tồn tại). Dùng làm tham chiếu / tái tạo môi trường.
--
-- LƯU Ý KHÁC BIỆT so với brief:
--   - Các khóa (items.id, jobs.id, users.job_id, inventory.item_id) đều là TEXT (không phải số).
--   - items có cột `type` (không có item_key / is_buyable).
--   - users CHƯA có cột `energy` (brief /work nhắc "-5 Năng lượng" => cần migration bổ sung sau).
--   - inventory.id là uuid.
-- ============================================================

create table if not exists items (
    id          text primary key,
    name        text not null,
    description text,
    price       bigint not null default 0,
    type        text
);

create table if not exists jobs (
    id               text primary key,
    name             text not null,
    required_level   int not null default 1,
    min_wage         int not null default 100,
    max_wage         int not null default 500,
    required_item_id text references items(id),
    risk_rate        real not null default 0.0
);

create table if not exists users (
    user_id    text primary key,
    wallet     bigint not null default 0,
    bank       bigint not null default 0,
    job_id     text references jobs(id),
    exp        int not null default 0,
    created_at timestamptz not null default now()
);

create table if not exists inventory (
    id       uuid primary key default gen_random_uuid(),
    user_id  text not null references users(user_id),
    item_id  text not null references items(id),
    quantity int not null default 1
);

create table if not exists cooldowns (
    user_id    text not null references users(user_id),
    command    text not null,
    expires_at timestamptz not null,
    primary key (user_id, command)
);

-- Các hàm RPC nguyên tử nằm ở 0002_functions.sql (ĐÃ áp dụng vào project Supabase).

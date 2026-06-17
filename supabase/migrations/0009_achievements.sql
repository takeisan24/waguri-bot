-- ============================================================
-- 0009_achievements.sql — Thành tựu (mở khóa 1 lần, vĩnh viễn).
-- Điều kiện tính từ trạng thái hiện tại (level/tài sản/nghề/đồ) nên không cần hook.
-- ============================================================
create table if not exists achievements (
    user_id        text not null,
    achievement_id text not null,
    unlocked_at    timestamptz not null default now(),
    primary key (user_id, achievement_id)
);

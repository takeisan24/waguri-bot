-- ============================================================
-- 0013_pets.sql — Thú cưng (mỗi người 1 con, MVP). Level tính từ exp.
-- ============================================================
create table if not exists user_pets (
    user_id    text primary key,
    species    text not null,
    name       text,
    exp        int not null default 0,
    adopted_at timestamptz not null default now(),
    fed_at     timestamptz
);

-- Cho ăn: cộng exp atomic, trả exp mới (null nếu chưa có pet).
create or replace function feed_pet(p_user text, p_exp int)
returns int language plpgsql as $$
declare v int;
begin
    update user_pets set exp = exp + p_exp, fed_at = now() where user_id = p_user returning exp into v;
    return v;
end; $$;

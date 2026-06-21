-- ============================================================
-- 0045_vote_streak.sql — Chuỗi vote (streak) + nhắc vote qua DM.
-- Thêm cột trên users + RPC tăng streak nguyên tử. Idempotent.
-- ============================================================

alter table users add column if not exists vote_streak   int not null default 0;
alter table users add column if not exists last_vote_at   timestamptz;
alter table users add column if not exists vote_reminded  boolean not null default false;  -- đã nhắc trong chu kỳ này chưa
alter table users add column if not exists vote_reminder  boolean not null default true;   -- user có muốn nhận nhắc không

-- Tăng streak khi vote: nếu lần vote trước còn trong "grace" -> +1; ngược lại reset về 1.
-- Reset cờ vote_reminded để chu kỳ sau lại được nhắc. Tự tạo user nếu chưa có. Trả streak mới.
create or replace function bump_vote_streak(p_user_id text, p_grace_seconds int)
returns int
language plpgsql
as $$
declare
    v_streak int;
begin
    insert into users(user_id) values (p_user_id) on conflict (user_id) do nothing;
    update users set
        vote_streak = case
            when last_vote_at is not null
                 and last_vote_at > now() - make_interval(secs => p_grace_seconds)
            then vote_streak + 1
            else 1
        end,
        last_vote_at  = now(),
        vote_reminded = false
    where user_id = p_user_id
    returning vote_streak into v_streak;
    return v_streak;
end;
$$;

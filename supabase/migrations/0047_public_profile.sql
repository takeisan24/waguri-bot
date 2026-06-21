-- ============================================================
-- 0047_public_profile.sql — Hồ sơ công khai cho web /u/[id] + API.
--   profile_public: user có cho hiển thị hồ sơ web không (mặc định có).
--   get_public_profile: gộp mọi thông tin hồ sơ trong 1 query (nhẹ cho API).
-- Idempotent.
-- ============================================================

alter table users add column if not exists profile_public boolean not null default true;

create or replace function get_public_profile(p_user_id text)
returns jsonb
language plpgsql
stable
as $$
declare r jsonb;
begin
    select jsonb_build_object(
        'exists', true,
        'public', coalesce(u.profile_public, true),
        'wallet', u.wallet,
        'bank', u.bank,
        'exp', u.exp,
        'job', j.name,
        'affection', coalesce(u.affection, 0),
        'partner_id', u.partner_id,
        'clan', c.name,
        'achievements', (select count(*) from achievements a where a.user_id = u.user_id),
        'wealth_rank', (select count(*) + 1 from users uu where (uu.wallet + uu.bank) > (u.wallet + u.bank))
    ) into r
    from users u
    left join jobs j on j.id = u.job_id
    left join clans c on c.id = u.clan_id
    where u.user_id = p_user_id;

    if r is null then return jsonb_build_object('exists', false); end if;
    return r;
end;
$$;

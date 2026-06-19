-- ============================================================
-- 0021_daily_milestones.sql — Thưởng mốc chuỗi điểm danh (7/14/30 ngày)
-- ============================================================

create or replace function claim_daily(p_user_id text)
returns jsonb language plpgsql as $$
declare v_last timestamptz; v_streak int; v_reward bigint; v_bank bigint; v_interest bigint; v_milestone bigint := 0;
begin
    insert into users(user_id) values(p_user_id) on conflict(user_id) do nothing;
    select last_daily, daily_streak, bank into v_last, v_streak, v_bank from users where user_id=p_user_id;
    if v_bank is null then v_bank := 0; end if;

    if v_last is not null and now() < v_last + interval '24 hours' then
        return jsonb_build_object('status','claimed','next', v_last + interval '24 hours');
    end if;

    if v_last is not null and now() < v_last + interval '48 hours' then
        v_streak := coalesce(v_streak,0) + 1;
    else
        v_streak := 1;
    end if;

    v_reward := 1000 + least(v_streak - 1, 29) * 200;

    -- Thưởng mốc chuỗi (một lần khi chạm mốc)
    if v_streak = 7 then v_milestone := 2000;
    elsif v_streak = 14 then v_milestone := 5000;
    elsif v_streak = 30 then v_milestone := 20000;
    end if;
    v_reward := v_reward + v_milestone;

    v_interest := least(floor(v_bank * 0.002), 5000);

    update users set
        wallet = wallet + v_reward,
        bank = bank + v_interest,
        last_daily = now(),
        daily_streak = v_streak
        where user_id=p_user_id;

    return jsonb_build_object('status','ok','reward', v_reward, 'streak', v_streak, 'interest', v_interest, 'milestone', v_milestone);
end; $$;

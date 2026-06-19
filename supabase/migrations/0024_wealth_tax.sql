-- ============================================================
-- 0024_wealth_tax.sql — Thuế tài sản chống lạm phát (ghìm whale)
-- Thu khi điểm danh: 1% phần tài sản (ví+bank) vượt 100.000, cap 50.000/ngày.
-- Chỉ "cắn" người siêu giàu giữ tiền nằm im; người chơi thường gần như không bị.
-- Trừ bank trước, thiếu thì trừ ví.
-- ============================================================

create or replace function claim_daily(p_user_id text)
returns jsonb language plpgsql as $$
declare
    v_last timestamptz; v_streak int; v_reward bigint; v_wallet bigint; v_bank bigint;
    v_interest bigint; v_milestone bigint := 0; v_assets bigint; v_tax bigint;
    c_threshold constant bigint := 100000;
    c_rate constant numeric := 0.01;
    c_cap constant bigint := 50000;
begin
    insert into users(user_id) values(p_user_id) on conflict(user_id) do nothing;
    select last_daily, daily_streak, wallet, bank into v_last, v_streak, v_wallet, v_bank from users where user_id=p_user_id;
    if v_wallet is null then v_wallet := 0; end if;
    if v_bank   is null then v_bank   := 0; end if;

    if v_last is not null and now() < v_last + interval '24 hours' then
        return jsonb_build_object('status','claimed','next', v_last + interval '24 hours');
    end if;

    if v_last is not null and now() < v_last + interval '48 hours' then
        v_streak := coalesce(v_streak,0) + 1;
    else
        v_streak := 1;
    end if;

    v_reward := 1000 + least(v_streak - 1, 29) * 200;
    if v_streak = 7 then v_milestone := 2000;
    elsif v_streak = 14 then v_milestone := 5000;
    elsif v_streak = 30 then v_milestone := 20000;
    end if;
    v_reward := v_reward + v_milestone;

    v_interest := least(floor(v_bank * 0.002), 5000);

    -- Thuế tài sản (trên tài sản TRƯỚC khi cộng thưởng hôm nay)
    v_assets := v_wallet + v_bank;
    v_tax := least(floor(greatest(0, v_assets - c_threshold) * c_rate), c_cap);

    -- Cộng thưởng + lãi
    v_wallet := v_wallet + v_reward;
    v_bank   := v_bank + v_interest;

    -- Trừ thuế: bank trước, thiếu thì ví
    if v_tax <= v_bank then
        v_bank := v_bank - v_tax;
    else
        v_wallet := v_wallet - (v_tax - v_bank);
        v_bank := 0;
    end if;

    update users set wallet = v_wallet, bank = v_bank, last_daily = now(), daily_streak = v_streak
        where user_id=p_user_id;

    return jsonb_build_object('status','ok','reward', v_reward, 'streak', v_streak,
        'interest', v_interest, 'milestone', v_milestone, 'tax', v_tax);
end; $$;

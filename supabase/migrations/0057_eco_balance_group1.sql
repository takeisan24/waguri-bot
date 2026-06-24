-- ============================================================
-- 0057_eco_balance_group1.sql — Cân bằng kinh tế (nhóm 1 audit)
-- ------------------------------------------------------------
-- (A) charge_assets: trừ tiền phạt theo TỔNG TÀI SẢN (ví trước, thiếu thì bank).
--     Dùng cho /rob & công an cờ bạc -> không còn né phạt bằng cách gửi hết vào bank (M1/M2).
-- (B) loan_create: thêm phí gốc 5% (đốt) cho bên cho vay -> chặn dùng vay/trả làm
--     kênh chuyển tiền MIỄN THUẾ giữa 2 tài khoản (M4). /give đã thu 5%, nay vay cũng có ma sát.
-- (C) claim_daily: cổ tức bang TRỪ TỪ QUỸ BANG thay vì mint -> hết lạm phát + farm bằng alt (M6).
-- Tất cả pin search_path cho khớp chuẩn hardening 0054/0055.
-- ============================================================

-- ---------- (A) charge_assets ----------
create or replace function charge_assets(p_user text, p_amount bigint)
returns bigint language plpgsql
set search_path = pg_catalog, public
as $$
declare v_w bigint; v_b bigint; v_from_w bigint; v_from_b bigint; v_take bigint;
begin
    select wallet, bank into v_w, v_b from users where user_id = p_user;
    if v_w is null then return 0; end if;
    v_w := coalesce(v_w, 0); v_b := coalesce(v_b, 0);
    v_take := least(greatest(p_amount, 0), v_w + v_b);
    if v_take <= 0 then return 0; end if;
    v_from_w := least(v_w, v_take);
    v_from_b := v_take - v_from_w;
    update users set wallet = wallet - v_from_w, bank = bank - v_from_b where user_id = p_user;
    return v_take;
end; $$;

-- ---------- (B) loan_create + phí gốc 5% (đốt) ----------
create or replace function loan_create(p_lender text, p_borrower text, p_principal bigint, p_interest numeric, p_days integer)
returns jsonb language plpgsql
set search_path = pg_catalog, public
as $$
declare v_upd int; v_due bigint; v_id bigint; v_when timestamptz; v_fee bigint;
begin
    insert into users(user_id) values(p_lender) on conflict(user_id) do nothing;
    insert into users(user_id) values(p_borrower) on conflict(user_id) do nothing;

    -- Phí lập khế ước 5% (đốt) — chống lách thuế chuyển tiền qua vay/trả giữa alt.
    v_fee := floor(p_principal * 0.05);
    update users set wallet = wallet - (p_principal + v_fee)
        where user_id = p_lender and wallet >= (p_principal + v_fee);
    get diagnostics v_upd = row_count;
    if v_upd = 0 then return jsonb_build_object('status','poor'); end if;

    update users set wallet = wallet + p_principal where user_id = p_borrower;
    v_due := floor(p_principal * (1 + p_interest));
    v_when := now() + make_interval(days => p_days);
    insert into loans(lender_id, borrower_id, principal, remaining, due_at)
        values (p_lender, p_borrower, p_principal, v_due, v_when) returning id into v_id;
    return jsonb_build_object('status','ok','loan_id', v_id, 'remaining', v_due, 'due_at', v_when, 'fee', v_fee);
end; $$;

-- ---------- (C) claim_daily: cổ tức bang trừ từ quỹ (không mint) ----------
create or replace function claim_daily(p_user_id text)
returns jsonb language plpgsql
set search_path = pg_catalog, public
as $$
declare
    v_last timestamptz; v_streak int; v_reward bigint; v_wallet bigint; v_bank bigint;
    v_interest bigint; v_milestone bigint := 0; v_assets bigint; v_tax bigint;
    v_clan bigint; v_cxp bigint; v_cbank bigint; v_clevel int; v_dividend bigint := 0;
    c_threshold constant bigint := 100000;
    c_rate constant numeric := 0.01;
    c_cap constant bigint := 50000;
begin
    insert into users(user_id) values(p_user_id) on conflict(user_id) do nothing;
    select last_daily, daily_streak, wallet, bank, clan_id into v_last, v_streak, v_wallet, v_bank, v_clan from users where user_id=p_user_id;
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

    -- Cổ tức bang hội theo cấp — TRỪ TỪ QUỸ BANG (redistribute), KHÔNG mint.
    if v_clan is not null then
        select xp, bank into v_cxp, v_cbank from clans where id = v_clan for update;
        v_clevel := floor(sqrt(coalesce(v_cxp,0) / 10000.0)) + 1;
        v_dividend := least(v_clevel * 100, greatest(coalesce(v_cbank,0), 0));
        if v_dividend > 0 then
            update clans set bank = bank - v_dividend where id = v_clan;
            v_reward := v_reward + v_dividend;
        end if;
    end if;

    v_assets := v_wallet + v_bank;
    v_tax := least(floor(greatest(0, v_assets - c_threshold) * c_rate), c_cap);

    v_wallet := v_wallet + v_reward;
    v_bank   := v_bank + v_interest;

    if v_tax <= v_bank then
        v_bank := v_bank - v_tax;
    else
        v_wallet := v_wallet - (v_tax - v_bank);
        v_bank := 0;
    end if;

    update users set wallet = v_wallet, bank = v_bank, last_daily = now(), daily_streak = v_streak
        where user_id=p_user_id;

    return jsonb_build_object('status','ok','reward', v_reward, 'streak', v_streak,
        'interest', v_interest, 'milestone', v_milestone, 'tax', v_tax, 'clan_dividend', v_dividend);
end; $$;

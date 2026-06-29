-- ============================================================
-- 0065_disease.sql — Hệ Bệnh (Disease)
--  • users.sick: trạng thái đang bệnh.
--  • set_sick: đánh dấu/bỏ bệnh (atomic).
--  • hospital_heal: chữa lành GIỜ kèm khỏi bệnh (sick=false).
-- Additive + idempotent. search_path pinned (giữ bảo mật như 0055/0062).
-- ============================================================

alter table users add column if not exists sick boolean not null default false;

create or replace function set_sick(p_user_id text, p_sick boolean)
returns boolean language plpgsql
set search_path = pg_catalog, public
as $$
begin
    insert into users (user_id) values (p_user_id) on conflict (user_id) do nothing;
    update users set sick = p_sick where user_id = p_user_id;
    return p_sick;
end; $$;

-- hospital_heal: viện phí cố định 3.000 + GIỜ khỏi bệnh khi nhập viện.
create or replace function hospital_heal(p_user_id text)
returns jsonb language plpgsql
set search_path = pg_catalog, public
as $$
declare v_wallet bigint; v_bank bigint; v_health int; v_sick boolean; v_total bigint; v_fee bigint; v_from_wallet bigint; v_from_bank bigint;
begin
    select wallet, bank, health, sick into v_wallet, v_bank, v_health, v_sick from users where user_id = p_user_id;
    if v_wallet is null then
        insert into users (user_id) values (p_user_id) on conflict (user_id) do nothing;
        select wallet, bank, health, sick into v_wallet, v_bank, v_health, v_sick from users where user_id = p_user_id;
    end if;
    if v_health is null then v_health := 100; end if;
    if v_wallet is null then v_wallet := 0; end if;
    if v_bank   is null then v_bank   := 0; end if;

    -- Đã khỏe MẠNH và KHÔNG bệnh -> không cần vào viện.
    if v_health >= 100 and coalesce(v_sick, false) = false then
        return jsonb_build_object('status', 'already_healthy', 'fee', 0);
    end if;

    v_total := v_wallet + v_bank;
    v_fee := 3000;   -- cố định

    if v_total < v_fee then
        return jsonb_build_object('status', 'insufficient_funds', 'fee', v_fee);
    end if;

    v_from_wallet := least(v_wallet, v_fee);
    v_from_bank := v_fee - v_from_wallet;

    update users set
        wallet = wallet - v_from_wallet,
        bank   = bank - v_from_bank,
        health = 100,
        sick   = false          -- khỏi bệnh khi nhập viện
        where user_id = p_user_id;

    return jsonb_build_object('status', 'ok', 'fee', v_fee, 'from_wallet', v_from_wallet, 'from_bank', v_from_bank);
end; $$;

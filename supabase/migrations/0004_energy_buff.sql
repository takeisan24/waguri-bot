-- ============================================================
-- 0004_energy_buff.sql — Cơ chế Năng lượng + Buff (bản cân bằng)
--  - users: energy (max 100), energy_updated_at (lazy regen), buff_mult, buff_expires_at
--  - items: effect_type ('none'|'energy'|'buff') + effect_value
--  - RPC: regen_energy, spend_energy, consume_item
-- Năng lượng hồi +1 mỗi 180s; /work tốn 10. Idempotent.
-- ============================================================

alter table users add column if not exists energy            int not null default 100;
alter table users add column if not exists energy_updated_at  timestamptz not null default now();
alter table users add column if not exists buff_mult          real not null default 1.0;
alter table users add column if not exists buff_expires_at    timestamptz;

alter table items add column if not exists effect_type  text not null default 'none';
alter table items add column if not exists effect_value int not null default 0;

-- Hồi năng lượng kiểu lazy: tính theo thời gian trôi qua, cập nhật mốc.
create or replace function regen_energy(p_user_id text)
returns int language plpgsql as $$
declare v_e int; v_t timestamptz; v_ticks int; v_new int;
begin
    insert into users (user_id) values (p_user_id) on conflict (user_id) do nothing;
    select energy, energy_updated_at into v_e, v_t from users where user_id = p_user_id;
    if v_e is null then v_e := 100; end if;
    if v_t is null then v_t := now(); end if;

    if v_e >= 100 then
        update users set energy_updated_at = now() where user_id = p_user_id and energy >= 100;
        return v_e;
    end if;

    v_ticks := floor(extract(epoch from (now() - v_t)) / 180);
    if v_ticks <= 0 then return v_e; end if;

    v_new := least(100, v_e + v_ticks);
    update users set energy = v_new,
        energy_updated_at = case when v_new >= 100 then now() else v_t + (v_ticks * interval '180 seconds') end
        where user_id = p_user_id;
    return v_new;
end; $$;

-- Tiêu năng lượng nguyên tử. Trả năng lượng còn lại (>=0), hoặc -1 nếu không đủ.
-- p_cost <= 0 => chỉ "peek" (hồi rồi trả về số hiện tại).
create or replace function spend_energy(p_user_id text, p_cost int)
returns int language plpgsql as $$
declare v_cur int;
begin
    v_cur := regen_energy(p_user_id);
    if p_cost <= 0 then return v_cur; end if;
    if v_cur < p_cost then return -1; end if;
    update users set
        energy = energy - p_cost,
        energy_updated_at = case when energy >= 100 then now() else energy_updated_at end
        where user_id = p_user_id;
    return v_cur - p_cost;
end; $$;

-- Dùng vật phẩm tiêu hao. Trả 'ok'|'no_item'|'not_consumable'|'no_have'.
create or replace function consume_item(p_user_id text, p_item_id text)
returns text language plpgsql as $$
declare v_type text; v_val int; v_qty int; v_cur int;
begin
    select effect_type, effect_value into v_type, v_val from items where id = p_item_id;
    if not found then return 'no_item'; end if;
    if v_type is null or v_type = 'none' then return 'not_consumable'; end if;

    select quantity into v_qty from inventory where user_id = p_user_id and item_id = p_item_id;
    if v_qty is null or v_qty < 1 then return 'no_have'; end if;

    update inventory set quantity = quantity - 1 where user_id = p_user_id and item_id = p_item_id;
    delete from inventory where user_id = p_user_id and item_id = p_item_id and quantity <= 0;

    if v_type = 'energy' then
        v_cur := regen_energy(p_user_id);
        update users set
            energy = least(100, v_cur + v_val),
            energy_updated_at = case when v_cur + v_val >= 100 then now() else energy_updated_at end
            where user_id = p_user_id;
    elsif v_type = 'buff' then
        update users set buff_mult = 1 + (v_val::real / 100), buff_expires_at = now() + interval '1 hour'
            where user_id = p_user_id;
    end if;

    return 'ok';
end; $$;

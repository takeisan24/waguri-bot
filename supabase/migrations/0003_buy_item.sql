-- ============================================================
-- 0003_buy_item.sql
--  - Ràng buộc UNIQUE(user_id, item_id) cho inventory (cần cho upsert khi mua).
--  - RPC buy_item: trừ tiền + cộng kho NGUYÊN TỬ.
-- (Dữ liệu jobs/items được seed trực tiếp trong project Supabase, không nằm ở đây.)
-- An toàn chạy lại (idempotent).
-- ============================================================

-- 1. UNIQUE constraint cho inventory
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'inventory_user_item_unique') then
        alter table inventory add constraint inventory_user_item_unique unique (user_id, item_id);
    end if;
end $$;

-- 2. buy_item: mua vật phẩm nguyên tử.
--    Trả: 'ok' | 'no_item' | 'insufficient_funds' | 'bad_quantity'
create or replace function buy_item(
    p_user_id  text,
    p_item_id  text,
    p_quantity int default 1
)
returns text
language plpgsql
as $$
declare
    v_price   bigint;
    v_total   bigint;
    v_updated int;
begin
    if p_quantity <= 0 then return 'bad_quantity'; end if;

    select price into v_price from items where id = p_item_id;
    if v_price is null then return 'no_item'; end if;

    v_total := v_price * p_quantity;

    insert into users (user_id) values (p_user_id) on conflict (user_id) do nothing;

    update users set wallet = wallet - v_total
        where user_id = p_user_id and wallet >= v_total;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then return 'insufficient_funds'; end if;

    insert into inventory (user_id, item_id, quantity)
        values (p_user_id, p_item_id, p_quantity)
        on conflict (user_id, item_id)
        do update set quantity = inventory.quantity + excluded.quantity;

    return 'ok';
end;
$$;

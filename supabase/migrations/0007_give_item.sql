-- ============================================================
-- 0007_give_item.sql — Admin cấp vật phẩm miễn phí (atomic upsert).
-- Trả TRUE nếu OK, FALSE nếu item không tồn tại / số lượng sai.
-- ============================================================
create or replace function give_item(p_user_id text, p_item_id text, p_qty int default 1)
returns boolean language plpgsql as $$
begin
    if p_qty <= 0 then return false; end if;
    if not exists (select 1 from items where id = p_item_id) then return false; end if;

    insert into users(user_id) values(p_user_id) on conflict(user_id) do nothing;
    insert into inventory(user_id, item_id, quantity) values(p_user_id, p_item_id, p_qty)
        on conflict (user_id, item_id) do update set quantity = inventory.quantity + excluded.quantity;
    return true;
end; $$;

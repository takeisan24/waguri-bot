-- ============================================================
-- 0058_vehicle_sync.sql — Đồng bộ xe cộ (M5)
-- ------------------------------------------------------------
-- Trước đây use_vehicle (+ work.js) chỉ nhận o_to_vinfast/xe_sh/xe_wave -> các xe
-- sh / o_to_cu / mercedes / xe_dap mua về VÔ DỤNG khi /work. Nay nhận MỌI xe,
-- ưu tiên xe có energy_cost THẤP NHẤT (khớp config.VEHICLES + work.js).
-- repair_tool vốn generic theo item_id -> /repair sửa được xe luôn (không cần đổi RPC).
-- ============================================================

create or replace function use_vehicle(p_user_id text)
returns jsonb language plpgsql
set search_path = pg_catalog, public
as $$
declare
    v_item_id text;
    v_qty int;
    v_dur int;
    v_broken boolean := false;
begin
    -- Ưu tiên xe xịn nhất (energy_cost thấp nhất) đang sở hữu.
    select item_id, quantity, durability into v_item_id, v_qty, v_dur
    from inventory
    where user_id = p_user_id
      and item_id in ('mercedes', 'o_to_cu', 'sh', 'o_to_vinfast', 'xe_sh', 'xe_wave', 'xe_dap')
    order by case item_id
        when 'mercedes' then 1
        when 'o_to_cu' then 2
        when 'sh' then 3
        when 'o_to_vinfast' then 4
        when 'xe_sh' then 5
        when 'xe_wave' then 6
        when 'xe_dap' then 7
        else 8
    end asc
    limit 1;

    if v_item_id is null then
        return null;
    end if;

    v_dur := coalesce(v_dur, 100) - 1;
    if v_dur <= 0 then
        v_broken := true;
        update inventory set quantity = quantity - 1, durability = 100 where user_id = p_user_id and item_id = v_item_id;
        delete from inventory where user_id = p_user_id and item_id = v_item_id and quantity <= 0;
    else
        update inventory set durability = v_dur where user_id = p_user_id and item_id = v_item_id;
    end if;

    return jsonb_build_object('status', 'ok', 'vehicle_id', v_item_id, 'durability', v_dur, 'broken', v_broken);
end; $$;

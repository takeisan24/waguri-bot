-- ============================================================
-- 0056_fix_consume_item_health.sql — VÁ LỖI: thuốc & hộp y tế không hồi máu
-- ------------------------------------------------------------
-- Bối cảnh: 0017 thêm nhánh xử lý effect_type='health' vào consume_item.
-- Nhưng 0033 (chạy SAU) định nghĩa lại consume_item để thêm buff theo
-- thời lượng và VÔ TÌNH bỏ mất nhánh 'health'. Hệ quả: /eat các món
-- (thuoc_cam_cum, hop_y_te, nuoc_chanh, chao_ga...) vẫn TRỪ vật phẩm và
-- trả 'ok' nhưng KHÔNG cập nhật cột health -> người chơi tưởng hồi máu
-- mà thực tế không, buộc phải /hospital tốn 10% tài sản.
--
-- Bản này khôi phục đầy đủ cả 3 nhánh (energy / buff-có-thời-lượng / health)
-- và pin search_path cho khớp chuẩn hardening ở 0054/0055.
-- ============================================================

create or replace function consume_item(p_user_id text, p_item_id text)
returns text language plpgsql
set search_path = pg_catalog, public
as $$
declare v_type text; v_val int; v_dur int; v_qty int; v_cur int;
begin
    select effect_type, effect_value, effect_duration_hours into v_type, v_val, v_dur from items where id = p_item_id;
    if not found then return 'no_item'; end if;
    if v_type is null or v_type = 'none' then return 'not_consumable'; end if;
    if v_dur is null then v_dur := 1; end if;

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
        update users set buff_mult = 1 + (v_val::real / 100), buff_expires_at = now() + make_interval(hours => v_dur)
            where user_id = p_user_id;
    elsif v_type = 'health' then
        update users set health = least(100, coalesce(health, 100) + v_val) where user_id = p_user_id;
    end if;

    return 'ok';
end; $$;

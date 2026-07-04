-- ============================================================
-- 0068_rename_item_ids.sql — Đổi các item id LỆCH NGHĨA sang id sạch (di sản đổi tên).
-- An toàn với FK (inventory NO ACTION): INSERT item mới -> REPOINT con (inventory/jobs/market) -> DELETE cũ.
-- Idempotent: chạy lại = no-op (id cũ không còn). Xem docs/audit-catalog.md §B.
--   bo_do_sua_xe -> bo_lam_banh   (Bộ Dụng Cụ Làm Bánh Gekka)
--   ve_vip       -> banh_kem_dau  (Bánh Kem Dâu Gekka)
--   ve_dai_gia   -> banh_cheesecake (Bánh Cheesecake Gekka)
--   bh_duong_pho -> bh_hoc_duong  (Bảo Hiểm Học Đường)
--   xe_sh        -> xe_vespa      (Xe Vespa Hồng Cute — tách khỏi 'sh' Honda SH)
--   nuoc_tang_luc-> soda_gekka    (Soda Trái Cây Gekka)
--   may_quay     -> may_anh       (Máy Ảnh Của Subaru)
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('bo_do_sua_xe','bo_lam_banh'),
    ('ve_vip','banh_kem_dau'),
    ('ve_dai_gia','banh_cheesecake'),
    ('bh_duong_pho','bh_hoc_duong'),
    ('xe_sh','xe_vespa'),
    ('nuoc_tang_luc','soda_gekka'),
    ('may_quay','may_anh')
  ) AS m(oldid, newid) LOOP
    INSERT INTO items (id,name,description,price,type,effect_type,effect_value,effect_duration_hours,shop_hidden,category)
      SELECT r.newid,name,description,price,type,effect_type,effect_value,effect_duration_hours,shop_hidden,category
      FROM items WHERE id=r.oldid;
    UPDATE inventory       SET item_id=r.newid          WHERE item_id=r.oldid;
    UPDATE jobs            SET required_item_id=r.newid WHERE required_item_id=r.oldid;
    UPDATE market_listings SET item_id=r.newid          WHERE item_id=r.oldid;
    DELETE FROM items WHERE id=r.oldid;
  END LOOP;
END $$;

-- use_vehicle hardcode 'xe_sh' -> đổi thành 'xe_vespa' (giữ nguyên logic + search_path).
CREATE OR REPLACE FUNCTION public.use_vehicle(p_user_id text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public' AS $function$
declare v_item_id text; v_qty int; v_dur int; v_broken boolean := false;
begin
    select item_id, quantity, durability into v_item_id, v_qty, v_dur
    from inventory
    where user_id = p_user_id
      and item_id in ('mercedes', 'o_to_cu', 'sh', 'o_to_vinfast', 'xe_vespa', 'xe_wave', 'xe_dap')
    order by case item_id
        when 'mercedes' then 1 when 'o_to_cu' then 2 when 'sh' then 3
        when 'o_to_vinfast' then 4 when 'xe_vespa' then 5 when 'xe_wave' then 6
        when 'xe_dap' then 7 else 8 end asc
    limit 1;
    if v_item_id is null then return null; end if;
    v_dur := coalesce(v_dur, 100) - 1;
    if v_dur <= 0 then
        v_broken := true;
        update inventory set quantity = quantity - 1, durability = 100 where user_id = p_user_id and item_id = v_item_id;
        delete from inventory where user_id = p_user_id and item_id = v_item_id and quantity <= 0;
    else
        update inventory set durability = v_dur where user_id = p_user_id and item_id = v_item_id;
    end if;
    return jsonb_build_object('status', 'ok', 'vehicle_id', v_item_id, 'durability', v_dur, 'broken', v_broken);
end; $function$;

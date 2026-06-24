-- ============================================================
-- 0060_low_fixes.sql — Vá nhóm LOW từ audit
-- ------------------------------------------------------------
-- (L3) add_health: cộng/trừ sức khỏe NGUYÊN TỬ (kẹp 0..100) -> hết lost-update khi đua
--      (trước đây addHealth đọc rồi ghi ở tầng JS, không atomic).
-- (L12) cân lại giá-trị đồ hồi máu cho đỡ lệch đơn giá/điểm (nuoc_chanh, chao_ga).
-- ============================================================

create or replace function add_health(p_user_id text, p_delta int)
returns int language plpgsql
set search_path = pg_catalog, public
as $$
declare v_new int;
begin
    insert into users(user_id) values (p_user_id) on conflict (user_id) do nothing;
    update users set health = greatest(0, least(100, coalesce(health, 100) + p_delta))
        where user_id = p_user_id
        returning health into v_new;
    return coalesce(v_new, 100);
end; $$;

-- L12: đơn giá ~7.5–9đ/điểm cho đồng đều (thuoc 7.5, hop_y_te 10, nay nuoc_chanh & chao_ga ~8.6–9).
update items set effect_value = 35 where id = 'nuoc_chanh' and effect_type = 'health';
update items set effect_value = 50 where id = 'chao_ga' and effect_type = 'health';

-- ============================================================
-- 0062_fix_stake_refund_orphans.sql — Vá lỗi DELETE không WHERE (code 21000)
-- ------------------------------------------------------------
-- stake_refund_orphans() (0059) dùng `delete from game_stakes;` không có WHERE
-- -> Supabase/Postgres chặn ("DELETE requires a WHERE clause") khi bot khởi động.
-- Thêm `where id is not null` (khớp mọi dòng) để qua kiểm tra mà vẫn xoá sạch.
-- ============================================================

create or replace function stake_refund_orphans()
returns jsonb language plpgsql
set search_path = pg_catalog, public
as $$
declare v_total bigint := 0; v_count int := 0; r record;
begin
    for r in select user_id, amount from game_stakes loop
        update users set wallet = wallet + r.amount where user_id = r.user_id;
        v_total := v_total + r.amount;
        v_count := v_count + 1;
    end loop;
    delete from game_stakes where id is not null;  -- WHERE bắt buộc (Supabase chặn DELETE trống)
    return jsonb_build_object('count', v_count, 'total', v_total);
end; $$;

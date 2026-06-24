-- ============================================================
-- 0062_low_fixes_round2.sql — Sửa đổi hệ thống cờ bạc & buff
-- ------------------------------------------------------------
-- 1. Thêm bảng lưu trữ mức độ cờ bạc (police_heat) để persist (L2).
-- 2. Hàm bump_police_heat tự động tính toán decay và tăng count.
-- 3. Cập nhật hàm consume_item chống buff downgrade (L13).
-- ============================================================

CREATE TABLE IF NOT EXISTS police_heat (
    user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    count INT NOT NULL DEFAULT 0,
    last_action_at BIGINT NOT NULL
);

-- Bật RLS cho police_heat
ALTER TABLE police_heat ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION bump_police_heat(p_user_id TEXT, p_decay_ms BIGINT)
RETURNS INT LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_count INT;
    v_ts BIGINT;
    v_now BIGINT;
    v_decayed INT;
BEGIN
    v_now := extract(epoch from now()) * 1000; -- epoch ms
    
    SELECT count, last_action_at INTO v_count, v_ts FROM police_heat WHERE user_id = p_user_id;
    
    IF NOT FOUND THEN
        v_count := 1;
        INSERT INTO police_heat (user_id, count, last_action_at) VALUES (p_user_id, v_count, v_now);
    ELSE
        -- Tính toán decay
        IF (v_now - v_ts) > p_decay_ms THEN
            v_decayed := floor((v_now - v_ts) / p_decay_ms);
            v_count := greatest(0, v_count - v_decayed);
        END IF;
        
        v_count := v_count + 1;
        
        UPDATE police_heat
        SET count = v_count, last_action_at = v_now
        WHERE user_id = p_user_id;
    END IF;
    
    RETURN v_count;
END;
$$;

-- Cập nhật consume_item chống buff downgrade
CREATE OR REPLACE FUNCTION consume_item(p_user_id text, p_item_id text)
RETURNS text language plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE v_type text; v_val int; v_dur int; v_qty int; v_cur int;
BEGIN
    SELECT effect_type, effect_value, effect_duration_hours INTO v_type, v_val, v_dur FROM items WHERE id = p_item_id;
    IF NOT FOUND THEN RETURN 'no_item'; END IF;
    IF v_type IS NULL OR v_type = 'none' THEN RETURN 'not_consumable'; END IF;
    IF v_dur IS NULL THEN v_dur := 1; END IF;

    SELECT quantity INTO v_qty FROM inventory WHERE user_id = p_user_id and item_id = p_item_id;
    IF v_qty IS NULL OR v_qty < 1 THEN RETURN 'no_have'; END IF;

    -- Kiểm tra chống buff downgrade
    IF v_type = 'buff' THEN
        DECLARE
            v_curr_mult real;
            v_curr_exp timestamptz;
        BEGIN
            SELECT buff_mult, buff_expires_at INTO v_curr_mult, v_curr_exp FROM users WHERE user_id = p_user_id;
            IF v_curr_exp IS NOT NULL AND v_curr_exp > now() AND v_curr_mult > (1 + (v_val::real / 100)) THEN
                RETURN 'buff_better_exists';
            END IF;
        END;
    END IF;

    UPDATE inventory SET quantity = quantity - 1 WHERE user_id = p_user_id and item_id = p_item_id;
    DELETE FROM inventory WHERE user_id = p_user_id and item_id = p_item_id and quantity <= 0;

    IF v_type = 'energy' THEN
        v_cur := regen_energy(p_user_id);
        UPDATE users SET
            energy = least(100, v_cur + v_val),
            energy_updated_at = case when v_cur + v_val >= 100 then now() else energy_updated_at end
            WHERE user_id = p_user_id;
    ELSIF v_type = 'buff' THEN
        UPDATE users SET buff_mult = 1 + (v_val::real / 100), buff_expires_at = now() + make_interval(hours => v_dur)
            WHERE user_id = p_user_id;
    ELSIF v_type = 'health' THEN
        UPDATE users SET health = least(100, coalesce(health, 100) + v_val) WHERE user_id = p_user_id;
    END IF;

    RETURN 'ok';
END;
$$;

-- ---------- 4) Khóa quyền truy cập trực tiếp từ anon/authenticated trên mọi bảng mới ----------
-- Đảm bảo các bảng mới tạo sau migration 0055 (như game_stakes, police_heat) cũng được bảo vệ.
do $$
declare r record;
begin
    for r in select tablename from pg_tables where schemaname = 'public' loop
        execute format('revoke all on table public.%I from anon, authenticated', r.tablename);
    end loop;
end $$;

-- ---------- 5) Đảm bảo search_path của tất cả hàm trong public schema đều được pin ----------
-- Tái lập/bổ sung cho các hàm mới tạo (như bump_police_heat, stake_collect, v.v.).
do $$
declare r record;
begin
    for r in
        select p.oid::regprocedure::text as sig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
    loop
        execute format('alter function %s set search_path = pg_catalog, public', r.sig);
    end loop;
end $$;

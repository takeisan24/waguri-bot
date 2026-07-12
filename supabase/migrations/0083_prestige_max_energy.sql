-- 0083_prestige_max_energy.sql
-- Cập nhật logic hồi/tiêu năng lượng theo cấp Chuyển sinh (prestige). Max Energy = 100 + prestige * 5.

CREATE OR REPLACE FUNCTION public.regen_energy(p_user_id TEXT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE 
    v_e INT; v_t TIMESTAMPTZ; v_ticks INT; v_new INT; v_prestige INT; v_max INT;
BEGIN
    INSERT INTO public.users (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    SELECT energy, energy_updated_at, prestige INTO v_e, v_t, v_prestige FROM public.users WHERE user_id = p_user_id;
    IF v_e IS NULL THEN v_e := 100; END IF;
    IF v_t IS NULL THEN v_t := now(); END IF;
    
    v_max := 100 + COALESCE(v_prestige, 0) * 5;

    IF v_e >= v_max THEN
        UPDATE public.users SET energy_updated_at = now() WHERE user_id = p_user_id AND energy >= v_max;
        RETURN v_e;
    END IF;

    v_ticks := floor(extract(epoch from (now() - v_t)) / 60); -- hồi +1 mỗi 60 giây (REGEN_SECONDS = 30)
    IF v_ticks <= 0 THEN RETURN v_e; END IF;

    v_new := least(v_max, v_e + v_ticks);
    UPDATE public.users SET energy = v_new,
        energy_updated_at = case when v_new >= v_max then now() else v_t + (v_ticks * interval '60 seconds') end
        where user_id = p_user_id;
    RETURN v_new;
END; $$;

CREATE OR REPLACE FUNCTION public.spend_energy(p_user_id TEXT, p_cost INT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE 
    v_cur INT; v_prestige INT; v_max INT;
BEGIN
    v_cur := regen_energy(p_user_id);
    IF p_cost <= 0 THEN RETURN v_cur; END IF;
    IF v_cur < p_cost THEN RETURN -1; END IF;

    SELECT prestige INTO v_prestige FROM public.users WHERE user_id = p_user_id;
    v_max := 100 + COALESCE(v_prestige, 0) * 5;

    UPDATE public.users SET
        energy = energy - p_cost,
        energy_updated_at = case when energy >= v_max then now() else energy_updated_at end
        where user_id = p_user_id;
    RETURN v_cur - p_cost;
END; $$;

CREATE OR REPLACE FUNCTION public.consume_item(p_user_id TEXT, p_item_id TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE 
    v_type TEXT; v_val INT; v_qty INT; v_cur INT; v_prestige INT; v_max INT;
BEGIN
    SELECT effect_type, effect_value into v_type, v_val from items where id = p_item_id;
    IF NOT FOUND THEN RETURN 'no_item'; END IF;
    IF v_type IS NULL OR v_type = 'none' THEN RETURN 'not_consumable'; END IF;

    SELECT quantity INTO v_qty FROM inventory WHERE user_id = p_user_id AND item_id = p_item_id;
    IF v_qty IS NULL OR v_qty < 1 THEN RETURN 'no_have'; END IF;

    UPDATE inventory SET quantity = quantity - 1 WHERE user_id = p_user_id AND item_id = p_item_id;
    DELETE FROM inventory WHERE user_id = p_user_id AND item_id = p_item_id AND quantity <= 0;

    IF v_type = 'energy' THEN
        v_cur := regen_energy(p_user_id);
        SELECT prestige INTO v_prestige FROM public.users WHERE user_id = p_user_id;
        v_max := 100 + COALESCE(v_prestige, 0) * 5;

        UPDATE users set
            energy = least(v_max, v_cur + v_val),
            energy_updated_at = case when v_cur + v_val >= v_max then now() else energy_updated_at end
            where user_id = p_user_id;
    ELSIF v_type = 'buff' then
        UPDATE users SET buff_mult = 1 + (v_val::real / 100), buff_expires_at = now() + interval '1 hour'
            where user_id = p_user_id;
    END IF;

    RETURN 'ok';
END; $$;

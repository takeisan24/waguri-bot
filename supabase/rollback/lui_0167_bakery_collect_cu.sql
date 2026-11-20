-- ============================================================
-- lui_0167_bakery_collect_cu.sql — ĐƯỜNG LÙI của 0167. KHÔNG phải migration.
-- Nằm NGOÀI supabase/migrations/. Khi cần lùi: chép thành migration số kế tiếp, áp test rồi prod.
--
-- ⚠️ Thân hàm dưới đây là bản ĐANG SỐNG trên waguri-test (pg_get_functiondef, 16/11/2026),
--    không chép từ 0066. Trước khi DROP trên DB đích hãy chụp lại def + proacl của chính DB đó
--    và dán đè nếu khác.
-- ⚠️ Hàm này cộng ví KHÔNG qua Lớp B, KHÔNG trừ lương. Chỉ lùi nếu thật sự cần.
-- Quyền: thu cả PUBLIC (0066 chỉ thu anon/authenticated — PUBLIC mặc định vẫn có EXECUTE).
-- Sau khi lùi: has_function_privilege('anon','public.bakery_collect(text,integer,bigint,bigint)','execute') = false
-- ============================================================

CREATE OR REPLACE FUNCTION public.bakery_collect(p_user_id text, p_rate integer, p_cap bigint, p_cake_every bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_stock BIGINT; v_last TIMESTAMPTZ; v_prog BIGINT;
        v_elapsed_min BIGINT; v_cap_min BIGINT; v_stock_min BIGINT; v_baked_min BIGINT;
        v_revenue BIGINT; v_total BIGINT; v_cakes INT;
BEGIN
    SELECT stock, last_collect_at, cake_progress INTO v_stock, v_last, v_prog
        FROM bakeries WHERE user_id=p_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('result','no_bakery'); END IF;

    v_elapsed_min := floor(EXTRACT(EPOCH FROM (now()-v_last)) / 60);
    v_cap_min     := floor(p_cap / p_rate);
    v_stock_min   := floor(v_stock / p_rate);
    v_baked_min   := least(v_elapsed_min, v_stock_min, v_cap_min);
    IF v_baked_min <= 0 THEN
        RETURN jsonb_build_object('result','empty','revenue',0,'stock',v_stock);
    END IF;

    v_revenue := v_baked_min * p_rate;
    v_total   := v_prog + v_revenue;
    v_cakes   := floor(v_total / p_cake_every);

    UPDATE bakeries SET
        stock           = stock - v_revenue,
        cake_progress   = v_total - v_cakes * p_cake_every,
        last_collect_at = v_last + (v_baked_min * interval '1 minute')
        WHERE user_id=p_user_id;
    UPDATE users SET wallet = wallet + v_revenue WHERE user_id=p_user_id;

    RETURN jsonb_build_object('result','ok','revenue',v_revenue,'cakes',v_cakes,
        'stock_left', v_stock - v_revenue,
        'capped', (v_elapsed_min > v_cap_min AND v_cap_min <= v_stock_min));
END $function$;

REVOKE EXECUTE ON FUNCTION public.bakery_collect(text, integer, bigint, bigint) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bakery_collect(text, integer, bigint, bigint) TO service_role;

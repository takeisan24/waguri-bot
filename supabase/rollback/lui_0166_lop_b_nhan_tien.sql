-- ============================================================
-- lui_0166_lop_b_nhan_tien.sql — ĐƯỜNG LÙI của 0166. KHÔNG phải migration.
-- Nằm NGOÀI supabase/migrations/. Khi cần lùi: chép thành migration số kế tiếp, áp test rồi prod.
--
-- ⚠️ THỨ TỰ LÙI BẮT BUỘC: lui_0167 -> lui_0166 -> lui_0165. lui_0165 có DROP ap_tran_lop_b;
--    chạy nó trước file này thì deliver_bakery_order / nhan_tien_lop_b gọi hàm không còn (42883).
-- ⚠️ TRẢ MÃ BOT VỀ BẢN CŨ TRƯỚC khi chạy file này: mã mới gọi RPC nhan_tien_lop_b; thiếu nó
--    thì /crate và /farm box mất tiền cược mà thưởng không vào (PGRST202).
-- Trả ap_tran_lop_b (7 nguồn) và deliver_bakery_order về thân trước 0166 (waguri-test 16/11/2026).
-- ============================================================

DROP FUNCTION IF EXISTS public.nhan_tien_lop_b(text, bigint, text);

CREATE OR REPLACE FUNCTION public.ap_tran_lop_b(
    p_user_id text,
    p_amount  bigint,
    p_source  text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
declare
    c_khoa     constant text   := 'thu_nhap_lop_b';
    c_tran     constant bigint := 2000000;
    c_int_max  constant bigint := 2147483647;
    v_ngay     date;
    v_day      date;
    v_count    bigint;
    v_truoc    bigint;
    v_cho_phep bigint;
begin
    if p_amount is null or p_amount <= 0 or p_source is null
       or p_source not in ('work', 'gather', 'crate', 'sell_item', 'sell_item_market',
                           'plant', 'bakery_collect_v2') then
        return p_amount;
    end if;

    v_ngay := (now() at time zone 'Asia/Ho_Chi_Minh')::date;

    insert into public.daily_counters (user_id, key, day, count)
    values (p_user_id, c_khoa, v_ngay, 0)
    on conflict (user_id, key) do nothing;

    select d.day, d.count::bigint
      into v_day, v_count
      from public.daily_counters d
     where d.user_id = p_user_id and d.key = c_khoa
       for update;
    if not found then
        raise exception 'ap_tran_lop_b: mat hang bo dem cua user %', p_user_id;
    end if;

    v_truoc    := case when v_day = v_ngay then v_count else 0 end;
    v_cho_phep := least(p_amount, greatest(c_tran - v_truoc, 0));

    update public.daily_counters
       set day   = v_ngay,
           count = least(v_truoc + v_cho_phep, c_int_max)::int
     where user_id = p_user_id and key = c_khoa;

    if v_cho_phep < p_amount then
        raise warning 'ap_tran_lop_b: kep user % nguon % xin % cho % (tong truoc %)',
            p_user_id, p_source, p_amount, v_cho_phep, v_truoc;
    end if;

    return v_cho_phep;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.ap_tran_lop_b(text, bigint, text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ap_tran_lop_b(text, bigint, text) TO service_role;

CREATE OR REPLACE FUNCTION public.deliver_bakery_order(p_user_id text, p_order_date date, p_order_id text, p_required_items jsonb, p_reward_coins bigint, p_reward_exp integer, p_reward_rep integer, p_cake_progress bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_item RECORD;
    v_item_id TEXT;
    v_req_qty INT;
    v_inv_qty INT;
    v_new_wallet BIGINT;
    v_new_exp BIGINT;
    v_new_rep INT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.bakeries WHERE user_id = p_user_id FOR UPDATE) THEN
        RETURN jsonb_build_object('success', false, 'error', 'NO_BAKERY');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.bakery_completed_orders
        WHERE user_id = p_user_id AND order_date = p_order_date AND order_id = p_order_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'ALREADY_DELIVERED');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_each_text(p_required_items) LOOP
        v_item_id := v_item.key;
        v_req_qty := v_item.value::INT;

        SELECT quantity INTO v_inv_qty
        FROM public.inventory
        WHERE user_id = p_user_id AND item_id = v_item_id
        FOR UPDATE;

        IF v_inv_qty IS NULL OR v_inv_qty < v_req_qty THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'MISSING_ITEMS',
                'item_id', v_item_id,
                'required', v_req_qty,
                'available', COALESCE(v_inv_qty, 0)
            );
        END IF;
    END LOOP;

    FOR v_item IN SELECT * FROM jsonb_each_text(p_required_items) LOOP
        v_item_id := v_item.key;
        v_req_qty := v_item.value::INT;

        UPDATE public.inventory
        SET quantity = quantity - v_req_qty
        WHERE user_id = p_user_id AND item_id = v_item_id;

        DELETE FROM public.inventory
        WHERE user_id = p_user_id AND item_id = v_item_id AND quantity <= 0;
    END LOOP;

    INSERT INTO public.bakery_completed_orders (user_id, order_date, order_id, delivered_at)
    VALUES (p_user_id, p_order_date, p_order_id, now());

    UPDATE public.users
    SET wallet = wallet + p_reward_coins,
        exp = exp + p_reward_exp
    WHERE user_id = p_user_id
    RETURNING wallet, exp INTO v_new_wallet, v_new_exp;

    UPDATE public.bakeries
    SET reputation = reputation + p_reward_rep,
        cake_progress = cake_progress + p_cake_progress
    WHERE user_id = p_user_id
    RETURNING reputation INTO v_new_rep;

    RETURN jsonb_build_object(
        'success', true,
        'reward_coins', p_reward_coins,
        'reward_exp', p_reward_exp,
        'reward_rep', p_reward_rep,
        'new_wallet', v_new_wallet,
        'new_exp', v_new_exp,
        'new_reputation', v_new_rep
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.deliver_bakery_order(text, date, text, jsonb, bigint, integer, integer, bigint) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.deliver_bakery_order(text, date, text, jsonb, bigint, integer, integer, bigint) TO service_role;

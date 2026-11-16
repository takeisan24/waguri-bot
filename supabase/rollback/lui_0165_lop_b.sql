-- ============================================================
-- lui_0165_lop_b.sql — ĐƯỜNG LÙI của 0165 (Lớp B). KHÔNG phải migration.
--
-- File này cố ý nằm NGOÀI supabase/migrations/ để không ai áp nhầm theo thứ tự số.
-- Khi cần lùi: chép nguyên văn thành migration số kế tiếp, áp waguri-test rồi mới prod.
--
-- ⚠️ ĐIỀU KIỆN AN TOÀN: lùi Lớp B = bỏ trần 2.000.000 xu/ngày. Lớp A (0163) ở 'enforce'
--    vẫn giữ work/gather theo dải, nhưng bán vật phẩm / thu tiệm bánh / crate / plant trở
--    lại KHÔNG có trần nào. Chỉ lùi khi Lớp B chặn lầm người chơi thật; ghi lý do + thời
--    điểm; theo dõi economy_ledger theo giờ cho tới khi áp lại.
--
-- ⚠️ THỨ TỰ LÀ BẮT BUỘC: (1) increment_balance -> (2) nhan_thu_nhap_chu_dong về thân 0163
--    -> (3) ba hàm bán/thu -> (4) CUỐI CÙNG mới drop ap_tran_lop_b. Drop sớm hơn thì mọi
--    /work, /fish, bán đồ, thu tiệm bánh lỗi "function does not exist" cho tới khi sửa.
--
-- NGUỒN CỦA CÁC THÂN HÀM: `pg_get_functiondef` trên DB thật ngay trước khi áp 0165
-- (16/11/2026), md5(prosrc) test = prod:
--     increment_balance  119b0f786c1a4c4ccb11df4ea55298a7
--     sell_item          cfac8a2e97c1b930105d27f1dfe4d077
--     bakery_collect_v2  5430eb55253f57882bbe4e5a721a9d6c
--     sell_item_market   66e2ad03ad2eda5688e29000d50f902a  (PROD)
-- `sell_item_market`: trước 0165, test và prod chỉ khác đúng chữ trong câu RAISE EXCEPTION
-- (test có dấu, prod không dấu). File này khôi phục chữ của PROD — sau khi lùi, md5 trên
-- test sẽ bằng md5 của prod, KHÔNG bằng md5 cũ của test.
-- Phải gửi file với xuống dòng LF: thân hàm trên DB không có ký tự CR, áp bản CRLF sẽ làm
-- lệch md5 dù logic y hệt.
--
-- Mỗi hàm tự đặt lại SECURITY / search_path / REVOKE / GRANT — không dựa vào trạng thái cũ.
-- Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1) increment_balance — thân thật trước 0165 (md5 prosrc 119b0f78…)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_balance(p_user_id text, p_field text, p_amount bigint, p_source text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
    new_val bigint;
begin
    perform set_config('app.ledger_source', coalesce(left(nullif(p_source, ''), 40), ''), true);

    insert into users (user_id) values (p_user_id)
        on conflict (user_id) do nothing;

    if p_field = 'wallet' then
        update users set wallet = wallet + p_amount
            where user_id = p_user_id and wallet + p_amount >= 0
            returning wallet into new_val;
    elsif p_field = 'bank' then
        update users set bank = bank + p_amount
            where user_id = p_user_id and bank + p_amount >= 0
            returning bank into new_val;
    else
        raise exception 'Invalid balance field: %', p_field;
    end if;

    return new_val;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.increment_balance(text, text, bigint, text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_balance(text, text, bigint, text) TO service_role;

-- ------------------------------------------------------------
-- 2) nhan_thu_nhap_chu_dong — thân 0163 (không gọi ap_tran_lop_b, không đặt cờ)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nhan_thu_nhap_chu_dong(
    p_user_id text,
    p_gross   bigint,
    p_source  text,
    p_mode    text
)
RETURNS TABLE(net bigint, net_tinh bigint, tong_truoc bigint, tong_sau bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
declare
    c_khoa     constant text    := 'thu_nhap_ngay';
    c_int_max  constant bigint  := 2147483647;
    c_moc_1    constant bigint  := 100000;
    c_moc_2    constant bigint  := 300000;
    c_moc_3    constant bigint  := 1000000;
    c_san      constant numeric := 400;
    v_ngay     date;
    v_cu       bigint;
    v_truoc    bigint;
    v_sau      bigint;
    v_cuoi     bigint;
    v_net_tinh bigint;
    v_ghi      bigint;
    v_so_du    bigint;
begin
    if p_user_id is null or p_user_id = '' then
        raise exception 'nhan_thu_nhap_chu_dong: thieu p_user_id' using errcode = '22023';
    end if;
    if p_gross is null or p_gross <= 0 or p_gross > 10000000 then
        raise exception 'nhan_thu_nhap_chu_dong: p_gross ngoai khoang (0, 10000000]: %', p_gross
            using errcode = '22023';
    end if;
    if p_source is null or p_source not in ('work', 'gather') then
        raise exception 'nhan_thu_nhap_chu_dong: p_source khong hop le: %', p_source
            using errcode = '22023';
    end if;
    if p_mode is null or p_mode not in ('log', 'enforce') then
        raise exception 'nhan_thu_nhap_chu_dong: p_mode khong hop le: %', p_mode
            using errcode = '22023';
    end if;

    v_ngay := (now() at time zone 'Asia/Ho_Chi_Minh')::date;

    -- 1) Khoá hàng bộ đếm (nếu đã có) và đọc tổng TRƯỚC lượt này. Khác ngày VN = 0.
    select case when d.day = v_ngay then d.count::bigint else 0 end
      into v_cu
      from public.daily_counters d
     where d.user_id = p_user_id and d.key = c_khoa
       for update;

    -- 2) Cộng dồn nguyên tử. Hai lượt đầu tiên tới cùng lúc: lượt sau chờ ở đây rồi rơi
    --    vào DO UPDATE, không lượt nào bị đếm thiếu.
    insert into public.daily_counters as d (user_id, key, day, count)
    values (p_user_id, c_khoa, v_ngay, least(p_gross, c_int_max)::int)
    on conflict (user_id, key) do update
       set count = least(
                       (case when d.day = v_ngay then d.count else 0 end)::bigint + p_gross,
                       c_int_max
                   )::int,
           day   = v_ngay
    returning d.count into v_sau;

    v_truoc := coalesce(v_cu, v_sau - p_gross);
    v_cuoi  := v_truoc + p_gross;

    -- 3) Tính từng khúc trên [v_truoc, v_cuoi), numeric chính xác, floor MỘT lần ở cuối.
    v_net_tinh := floor(
          greatest(least(v_cuoi, c_moc_1) - v_truoc, 0)                    * 1.0
        + greatest(least(v_cuoi, c_moc_2) - greatest(v_truoc, c_moc_1), 0) * 0.5
        + greatest(least(v_cuoi, c_moc_3) - greatest(v_truoc, c_moc_2), 0) * 0.1
        + least(greatest(v_cuoi - greatest(v_truoc, c_moc_3), 0) * 0.1, c_san)
    )::bigint;

    v_ghi := case when p_mode = 'enforce' then v_net_tinh else p_gross end;

    -- 4) Ghi ví trong CÙNG transaction. NULL = không ghi được -> rollback cả bộ đếm.
    v_so_du := public.increment_balance(p_user_id, 'wallet', v_ghi, p_source);
    if v_so_du is null then
        raise exception 'nhan_thu_nhap_chu_dong: khong ghi duoc vi (user %, so %)', p_user_id, v_ghi;
    end if;

    net        := v_ghi;
    net_tinh   := v_net_tinh;
    tong_truoc := v_truoc;
    tong_sau   := v_sau;
    return next;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.nhan_thu_nhap_chu_dong(text, bigint, text, text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.nhan_thu_nhap_chu_dong(text, bigint, text, text) TO service_role;

-- ------------------------------------------------------------
-- 3a) sell_item — SECURITY INVOKER, search_path = public
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sell_item(p_user_id text, p_item_id text, p_quantity integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_price bigint; v_qty int; v_gain bigint; v_upd int;
begin
    if p_quantity <= 0 then return jsonb_build_object('status','bad_quantity'); end if;

    select price into v_price from items where id = p_item_id;
    if v_price is null then return jsonb_build_object('status','no_item'); end if;

    -- Khóa dòng kho: hai lệnh bán cùng lúc bị tuần tự hóa -> không bán đúp.
    select quantity into v_qty from inventory
        where user_id = p_user_id and item_id = p_item_id for update;
    if v_qty is null or v_qty < p_quantity then return jsonb_build_object('status','no_have'); end if;

    v_gain := floor(v_price * 0.5) * p_quantity;  -- bán lại 50% giá

    -- Guard số lượng + kiểm row_count: credit ví CHỈ khi thực sự trừ được kho.
    update inventory set quantity = quantity - p_quantity
        where user_id = p_user_id and item_id = p_item_id and quantity >= p_quantity;
    get diagnostics v_upd = row_count;
    if v_upd = 0 then return jsonb_build_object('status','no_have'); end if;

    delete from inventory where user_id = p_user_id and item_id = p_item_id and quantity <= 0;
    update users set wallet = wallet + v_gain where user_id = p_user_id;

    return jsonb_build_object('status','ok','gain', v_gain);
end; $function$;

REVOKE EXECUTE ON FUNCTION public.sell_item(text, text, integer) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sell_item(text, text, integer) TO service_role;

-- ------------------------------------------------------------
-- 3b) sell_item_market — SECURITY DEFINER, search_path = pg_catalog, public (chữ của PROD)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sell_item_market(p_user_id text, p_item_id text, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_inv_amount INT;
    v_unit_price BIGINT;
    v_total_earned BIGINT;
    v_new_wallet BIGINT;
    v_rows INT;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
    END IF;

    SELECT quantity INTO v_inv_amount
    FROM public.inventory
    WHERE user_id = p_user_id AND item_id = p_item_id
    FOR UPDATE;

    IF v_inv_amount IS NULL OR v_inv_amount < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_ENOUGH_ITEMS',
                                  'available', COALESCE(v_inv_amount, 0));
    END IF;

    v_unit_price := public.market_unit_price(p_item_id);
    IF v_unit_price IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ITEM_NOT_SELLABLE');
    END IF;

    v_total_earned := v_unit_price * p_amount;

    UPDATE public.inventory
    SET quantity = quantity - p_amount
    WHERE user_id = p_user_id AND item_id = p_item_id AND quantity >= p_amount;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_ENOUGH_ITEMS',
                                  'available', COALESCE(v_inv_amount, 0));
    END IF;

    DELETE FROM public.inventory
    WHERE user_id = p_user_id AND item_id = p_item_id AND quantity <= 0;

    UPDATE public.users
    SET wallet = wallet + v_total_earned
    WHERE user_id = p_user_id
    RETURNING wallet INTO v_new_wallet;

    IF v_new_wallet IS NULL THEN
        RAISE EXCEPTION 'sell_item_market: khong tim thay user %', p_user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'earned', v_total_earned,
        'unit_price', v_unit_price,
        'amount', p_amount,
        'new_wallet', v_new_wallet
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sell_item_market(text, text, integer) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sell_item_market(text, text, integer) TO service_role;

-- ------------------------------------------------------------
-- 3c) bakery_collect_v2 — SECURITY INVOKER, search_path = public
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bakery_collect_v2(p_user_id text, p_rate integer, p_cap bigint, p_cake_every bigint, p_wage_pct real)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_stock BIGINT; v_last TIMESTAMPTZ; v_prog BIGINT;
        v_elapsed_min BIGINT; v_cap_min BIGINT; v_stock_min BIGINT; v_baked_min BIGINT;
        v_revenue BIGINT; v_wage BIGINT; v_net BIGINT; v_total BIGINT; v_cakes INT;
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
    v_wage    := round(v_revenue * p_wage_pct);
    v_net     := v_revenue - v_wage;

    v_total   := v_prog + v_revenue;
    v_cakes   := floor(v_total / p_cake_every);

    UPDATE bakeries SET
        stock           = stock - v_revenue,
        cake_progress   = v_total - v_cakes * p_cake_every,
        last_collect_at = v_last + (v_baked_min * interval '1 minute')
        WHERE user_id=p_user_id;
        
    UPDATE users SET wallet = wallet + v_net WHERE user_id=p_user_id;

    RETURN jsonb_build_object('result','ok','revenue',v_net,'wage_deducted',v_wage,'cakes',v_cakes,
        'stock_left', v_stock - v_revenue,
        'capped', (v_elapsed_min > v_cap_min AND v_cap_min <= v_stock_min));
END $function$;

REVOKE EXECUTE ON FUNCTION public.bakery_collect_v2(text, integer, bigint, bigint, real) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bakery_collect_v2(text, integer, bigint, bigint, real) TO service_role;

-- ------------------------------------------------------------
-- 4) CHỈ SAU KHI không còn hàm nào gọi nó: xoá hàm trần chung
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ap_tran_lop_b(text, bigint, text);

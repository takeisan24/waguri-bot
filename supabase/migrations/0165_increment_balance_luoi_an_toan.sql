-- ============================================================
-- 0165_increment_balance_luoi_an_toan.sql — Lớp B: trần tuyệt đối 2.000.000 xu/ngày cho
-- các nguồn "kiếm được bằng cách lặp lại hành động"
--
-- VÌ SAO CẦN: Lớp A (0163) chỉ gắn vào `work` + `gather`. Sau khi về sàn, bốn lệnh chạy
-- song song vẫn in được vài trăm nghìn xu/giờ; và bán vật phẩm / thu tiệm bánh không qua
-- Lớp A. Lớp B là lưới cuối: tổng tiền DƯƠNG một người nhận trong một ngày (giờ VN) từ
-- DANH SÁCH TRẮNG 7 nguồn không vượt 2.000.000.
--
-- DANH SÁCH TRẮNG (đủ, không có "…"):
--     work · gather · crate · sell_item · sell_item_market · plant · bakery_collect_v2
-- Mọi nguồn khác (chuyển khoản, rút/nạp bank, hoàn cược, thưởng một lần, cờ bạc, admin…)
-- KHÔNG BAO GIỜ bị kẹp — kẹp chúng là phá chức năng.
--
-- THIẾT KẾ — một hàm trần chung `ap_tran_lop_b`, gọi ở MỌI chỗ ghi ví của danh sách trắng:
--   • `increment_balance` (work/gather lạc đường, crate, plant đi qua đây);
--   • `sell_item`, `sell_item_market`, `bakery_collect_v2` — ba hàm này ghi THẲNG
--     `UPDATE users SET wallet`, không qua `increment_balance`; chỉ kẹp trong
--     `increment_balance` thì chúng lọt hoàn toàn;
--   • `nhan_thu_nhap_chu_dong` (0163) — gọi trần trước, đặt cờ `app.lop_b_da_ap` để
--     `increment_balance` không kẹp lần hai, và trả `net` = số THỰC vào ví.
--
-- `ap_tran_lop_b` theo đúng thứ tự: INSERT … DO NOTHING (bảo đảm có hàng) -> SELECT … FOR
-- UPDATE (khoá) -> tính -> UPDATE. Đọc rồi mới tính khi chưa khoá = hai lượt cùng thấy
-- tổng cũ và cùng vượt trần. Bộ đếm cộng SỐ ĐƯỢC PHÉP, không cộng số xin.
--
-- THỨ TỰ KHOÁ (chống deadlock): hàng `daily_counters` trước hàng `users`, và trong
-- `daily_counters` thì `thu_nhap_ngay` trước `thu_nhap_lop_b`. Vì vậy `ap_tran_lop_b` luôn
-- được gọi TRƯỚC mọi lệnh chạm `users` trong cùng hàm. Ba hàm bán/thu khoá hàng kho/tiệm
-- (`inventory` / `bakeries`) trước cả hai — nhất quán: không hàm nào trong file này giữ
-- khoá `daily_counters` hay `users` rồi mới xin khoá kho/tiệm.
--
-- THÂN HÀM CŨ: lấy bằng `pg_get_functiondef` trên DB THẬT (16/11/2026), không chép từ file
-- migration cũ. Giữ nguyên chữ ký, kiểu trả, SECURITY (riêng `sell_item_market` là
-- SECURITY DEFINER — giữ), `search_path` và quyền. Chỉ CHÈN thêm lời gọi trần; JSON trả về
-- mang SỐ ĐÃ KẸP (cùng khoá JSON cũ: gain / earned / revenue) để lệnh in đúng số vào ví.
-- Vật phẩm / bánh vẫn bị trừ như cũ khi đã chạm trần.
-- Ghi chú `sell_item_market`: test và prod chỉ khác đúng chữ trong câu RAISE EXCEPTION
-- (test có dấu, prod không dấu). File này dùng chữ của PROD cho cả hai.
--
-- BẢO MẬT (luật 4): hàm mới SECURITY INVOKER, pin search_path, chỉ service_role được gọi.
-- Cờ `app.lop_b_da_ap` đặt với is_local = true (chỉ sống trong transaction hiện tại) và
-- bị `increment_balance` xoá ngay ở lần gọi kế tiếp, bất kể tham số.
--
-- Đường lùi: supabase/rollback/lui_0165_lop_b.sql (NGOÀI thư mục migrations).
-- Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1) HÀM TRẦN CHUNG
-- ------------------------------------------------------------
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
    -- Không phải tiền dương, hoặc nguồn ngoài danh sách trắng (kể cả không khai nguồn):
    -- trả nguyên, không chạm bộ đếm.
    if p_amount is null or p_amount <= 0 or p_source is null
       or p_source not in ('work', 'gather', 'crate', 'sell_item', 'sell_item_market',
                           'plant', 'bakery_collect_v2') then
        return p_amount;
    end if;

    v_ngay := (now() at time zone 'Asia/Ho_Chi_Minh')::date;

    -- 1) Bảo đảm hàng tồn tại.
    insert into public.daily_counters (user_id, key, day, count)
    values (p_user_id, c_khoa, v_ngay, 0)
    on conflict (user_id, key) do nothing;

    -- 2) Khoá hàng rồi mới đọc. Khác ngày VN = tổng 0.
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

    -- 3) Cộng SỐ ĐƯỢC PHÉP (bigint rồi mới kẹp về int).
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

-- ------------------------------------------------------------
-- 2) increment_balance — giữ chữ ký 4 tham số + kiểu trả bigint (số dư mới).
--    Chỉ thêm khối "Lớp B" ở đầu; phần còn lại y hệt bản đang sống.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_balance(p_user_id text, p_field text, p_amount bigint, p_source text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
    new_val bigint;
begin
    -- Lớp B (0165). Cờ '1' = người gọi (nhan_thu_nhap_chu_dong) đã áp trần rồi: không kẹp
    -- lần hai, và xoá cờ NGAY — bất kể p_field / p_amount — để không lời gọi nào sau đó
    -- trong cùng transaction thừa hưởng. Phải đứng TRƯỚC mọi lệnh chạm hàng users.
    if coalesce(current_setting('app.lop_b_da_ap', true), '') = '1' then
        perform set_config('app.lop_b_da_ap', '', true);
    elsif p_field = 'wallet' and p_amount > 0 then
        p_amount := ap_tran_lop_b(p_user_id, p_amount, p_source);
    end if;

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
-- 3) sell_item — SECURITY INVOKER, search_path = public (giữ nguyên)
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
    -- Lớp B (0165): kẹp theo trần ngày TRƯỚC khi chạm hàng users; 'gain' là số đã kẹp.
    v_gain := ap_tran_lop_b(p_user_id, v_gain, 'sell_item');
    update users set wallet = wallet + v_gain where user_id = p_user_id;

    return jsonb_build_object('status','ok','gain', v_gain);
end; $function$;

REVOKE EXECUTE ON FUNCTION public.sell_item(text, text, integer) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sell_item(text, text, integer) TO service_role;

-- ------------------------------------------------------------
-- 4) sell_item_market — SECURITY DEFINER (giữ nguyên), search_path = pg_catalog, public
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

    -- Lớp B (0165): kẹp theo trần ngày TRƯỚC khi chạm hàng users; 'earned' là số đã kẹp.
    v_total_earned := public.ap_tran_lop_b(p_user_id, v_total_earned, 'sell_item_market');

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
-- 5) bakery_collect_v2 — SECURITY INVOKER, search_path = public (giữ nguyên)
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

    -- Lớp B (0165): kẹp theo trần ngày TRƯỚC khi chạm hàng users; 'revenue' là số đã kẹp.
    v_net := ap_tran_lop_b(p_user_id, v_net, 'bakery_collect_v2');
    UPDATE users SET wallet = wallet + v_net WHERE user_id=p_user_id;

    RETURN jsonb_build_object('result','ok','revenue',v_net,'wage_deducted',v_wage,'cakes',v_cakes,
        'stock_left', v_stock - v_revenue,
        'capped', (v_elapsed_min > v_cap_min AND v_cap_min <= v_stock_min));
END $function$;

REVOKE EXECUTE ON FUNCTION public.bakery_collect_v2(text, integer, bigint, bigint, real) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bakery_collect_v2(text, integer, bigint, bigint, real) TO service_role;

-- ------------------------------------------------------------
-- 6) nhan_thu_nhap_chu_dong — bản cập nhật của 0163: áp trần Lớp B TRƯỚC khi ghi ví, và
--    trả net = số THỰC vào ví (increment_balance trả số dư mới chứ không trả số đã cộng,
--    nên số thực ghi phải lấy từ ap_tran_lop_b).
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
    v_ghi_that bigint;
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

    -- 4) Lớp B (0165): trần ngày chung. Khoá thu_nhap_ngay (trên) -> thu_nhap_lop_b (ở
    --    đây) -> users (trong increment_balance). Cờ báo increment_balance đừng kẹp lần hai.
    v_ghi_that := public.ap_tran_lop_b(p_user_id, v_ghi, p_source);
    perform set_config('app.lop_b_da_ap', '1', true);

    -- 5) Ghi ví trong CÙNG transaction. NULL = không ghi được -> rollback cả hai bộ đếm.
    v_so_du := public.increment_balance(p_user_id, 'wallet', v_ghi_that, p_source);
    perform set_config('app.lop_b_da_ap', '', true);
    if v_so_du is null then
        raise exception 'nhan_thu_nhap_chu_dong: khong ghi duoc vi (user %, so %)', p_user_id, v_ghi_that;
    end if;

    net        := v_ghi_that;
    net_tinh   := v_net_tinh;
    tong_truoc := v_truoc;
    tong_sau   := v_sau;
    return next;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.nhan_thu_nhap_chu_dong(text, bigint, text, text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.nhan_thu_nhap_chu_dong(text, bigint, text, text) TO service_role;

-- ============================================================
-- VERIFY (trên waguri-test, người dùng tạm):
--   thu_nhap_lop_b = 1.999.000 -> sell_item món đáng 5.000 -> ví +1.000, JSON gain = 1000
--   thu_nhap_lop_b = 1.999.900 -> nhan_thu_nhap_chu_dong(gross 3.250, 'work', 'enforce') -> net = 100
--   hàng thu_nhap_lop_b có day = hôm qua -> coi tổng 0, nhận đủ
--   increment_balance(…, 'wallet', +n, 'transfer_bank' | NULL) -> KHÔNG bị kẹp
--   has_function_privilege('anon', 'public.ap_tran_lop_b(text,bigint,text)', 'execute') = false
-- ============================================================

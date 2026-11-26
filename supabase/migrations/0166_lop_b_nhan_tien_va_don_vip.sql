-- ============================================================
-- 0166_lop_b_nhan_tien_va_don_vip.sql — vá 2 lỗ Lớp B mà 0165 để ngoài phạm vi
-- (spec: docs/spec-3-lo-ngoai-spec-2026-11-16.md, Q1 = A)
--
--   1) `nhan_tien_lop_b` — RPC mới cho thưởng dương của /crate và /farm box: áp trần
--      `ap_tran_lop_b` rồi ghi ví trong MỘT transaction, TRẢ SỐ THỰC NHẬN (increment_balance
--      chỉ trả số dư mới nên chỗ gọi không biết số đã kẹp -> embed từng khoe số chưa kẹp).
--      Nhãn nguồn do chỗ gọi truyền tường minh, KHÔNG còn suy từ tên tệp. Chỉ nhận 'crate' /
--      'plant': gõ sai nhãn thì báo lỗi, không lặng lẽ thoát trần.
--   2) `ap_tran_lop_b` thêm nguồn 'bakery_order' vào danh sách trắng (nay 8 nguồn);
--      `deliver_bakery_order` gọi trần TRƯỚC khi chạm `users`. Đơn vẫn giao, vật phẩm vẫn
--      bị trừ khi chạm trần; JSON trả số đã kẹp + số gốc + cờ capped.
--
-- THÂN HÀM CŨ lấy bằng pg_get_functiondef trên waguri-test (16/11/2026) — deliver_bakery_order
-- giữ SECURITY DEFINER + search_path = pg_catalog, public; ap_tran_lop_b giữ SECURITY INVOKER.
--
-- ĐIỀU KIỆN ÁP: chỉ khi 0163–0165 đã có trên DB đích. Áp 0166 TRƯỚC khi restart bot mã mới.
-- Đường lùi: supabase/rollback/lui_0166_lop_b_nhan_tien.sql (thứ tự lùi: 0167 -> 0166 -> 0165).
-- Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1) ap_tran_lop_b — thêm 'bakery_order'
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
                           'plant', 'bakery_collect_v2', 'bakery_order') then
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
-- 2) nhan_tien_lop_b — áp trần + ghi ví, trả số THỰC nhận
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nhan_tien_lop_b(
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
    v_ghi   bigint;
    v_so_du bigint;
begin
    if p_user_id is null or p_user_id = '' then
        raise exception 'nhan_tien_lop_b: thieu p_user_id' using errcode = '22023';
    end if;
    if p_amount is null or p_amount <= 0 or p_amount > 10000000 then
        raise exception 'nhan_tien_lop_b: p_amount ngoai khoang (0, 10000000]: %', p_amount
            using errcode = '22023';
    end if;
    -- Chỉ hai nguồn dùng RPC này. Nhãn gõ sai phải lỗi to, không được lặng lẽ thoát trần.
    if p_source is null or p_source not in ('crate', 'plant') then
        raise exception 'nhan_tien_lop_b: p_source khong hop le: %', p_source
            using errcode = '22023';
    end if;

    v_ghi := public.ap_tran_lop_b(p_user_id, p_amount, p_source);

    -- Trần đã đầy: không có gì để ghi. KHÔNG đặt cờ, KHÔNG gọi increment_balance.
    if v_ghi <= 0 then
        return 0;
    end if;

    -- Cờ báo increment_balance đừng kẹp lần hai; đặt ngay trước, xoá ngay sau.
    perform set_config('app.lop_b_da_ap', '1', true);
    v_so_du := public.increment_balance(p_user_id, 'wallet', v_ghi, p_source);
    perform set_config('app.lop_b_da_ap', '', true);
    if v_so_du is null then
        raise exception 'nhan_tien_lop_b: khong ghi duoc vi (user %, so %)', p_user_id, v_ghi;
    end if;

    return v_ghi;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.nhan_tien_lop_b(text, bigint, text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.nhan_tien_lop_b(text, bigint, text) TO service_role;

-- ------------------------------------------------------------
-- 3) deliver_bakery_order — SECURITY DEFINER (giữ nguyên), gọi trần trước khi chạm users
-- ------------------------------------------------------------
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
    v_coins BIGINT;
BEGIN
    -- 1. Kiểm tra tiệm bánh tồn tại
    IF NOT EXISTS (SELECT 1 FROM public.bakeries WHERE user_id = p_user_id FOR UPDATE) THEN
        RETURN jsonb_build_object('success', false, 'error', 'NO_BAKERY');
    END IF;

    -- 2. Kiểm tra xem đơn đã giao hôm nay chưa
    IF EXISTS (
        SELECT 1 FROM public.bakery_completed_orders
        WHERE user_id = p_user_id AND order_date = p_order_date AND order_id = p_order_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'ALREADY_DELIVERED');
    END IF;

    -- 3. Kiểm tra kho đồ cho tất cả vật phẩm yêu cầu (FOR UPDATE)
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

    -- 4. Trừ vật phẩm trong kho đồ
    FOR v_item IN SELECT * FROM jsonb_each_text(p_required_items) LOOP
        v_item_id := v_item.key;
        v_req_qty := v_item.value::INT;

        UPDATE public.inventory
        SET quantity = quantity - v_req_qty
        WHERE user_id = p_user_id AND item_id = v_item_id;

        DELETE FROM public.inventory
        WHERE user_id = p_user_id AND item_id = v_item_id AND quantity <= 0;
    END LOOP;

    -- 5. Ghi nhận đã giao đơn hàng
    INSERT INTO public.bakery_completed_orders (user_id, order_date, order_id, delivered_at)
    VALUES (p_user_id, p_order_date, p_order_id, now());

    -- 5b. Lớp B (0166): kẹp theo trần ngày TRƯỚC khi chạm hàng users; v_coins là số đã kẹp.
    --     Đơn vẫn giao, vật phẩm vẫn bị trừ khi chạm trần. Nhãn cho sổ cái.
    v_coins := public.ap_tran_lop_b(p_user_id, p_reward_coins, 'bakery_order');
    PERFORM set_config('app.ledger_source', 'bakery_order', true);

    -- 6. Cộng thưởng cho user (ví tiền + EXP)
    UPDATE public.users
    SET wallet = wallet + v_coins,
        exp = exp + p_reward_exp
    WHERE user_id = p_user_id
    RETURNING wallet, exp INTO v_new_wallet, v_new_exp;

    -- 7. Cập nhật tiệm bánh (Danh tiếng + tiến trình bánh)
    UPDATE public.bakeries
    SET reputation = reputation + p_reward_rep,
        cake_progress = cake_progress + p_cake_progress
    WHERE user_id = p_user_id
    RETURNING reputation INTO v_new_rep;

    RETURN jsonb_build_object(
        'success', true,
        'reward_coins', v_coins,
        'reward_coins_goc', p_reward_coins,
        'capped', (v_coins < p_reward_coins),
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

-- ============================================================
-- VERIFY (waguri-test): xem spec S6 #1–#6, #12.
-- ============================================================

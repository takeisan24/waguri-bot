-- ============================================================
-- 0098_market_derived_pricing.sql
-- Sửa dứt điểm sự cố Chợ Biến Động (audit 2026-08-13).
--
-- VẤN ĐỀ ĐÃ XẢY RA TRÊN PROD:
--   A) `0096_fix_market_item_ids.sql` KHÔNG được áp (trùng số với
--      `0096_wealth_rank_and_bakery_privacy.sql` — file kia được áp, file này bị bỏ sót).
--      -> 9/12 item không có dòng trong `market_prices` -> RPC rơi vào nhánh dự phòng
--         `v_unit_price := 500` -> BÁN MỌI THỨ VỚI GIÁ 500 XU:
--           · ca_koi_nhat (catalog 80.000, bán cũ 40.000) -> 500   = mất 98,8% giá trị
--           · trai_1500 / hoa_3500 / vang_dong_tren …     -> 500   = mất 67–86%
--           · go (mua 60) -> 500 = +733% MÁY IN TIỀN;  quang_sat (mua 100) -> 500 = +400%
--   B) `market_prices.current_price` KHÔNG CÓ CODE NÀO GHI VÀO (0 writer trong repo).
--      Giá hiển thị (/market prices, web /market) tính bằng hash JS, giá BÁN đọc từ bảng
--      -> hai con số khác nhau, bot nói sai với người chơi.
--   C) RPC thiếu FOR UPDATE  -> bán song song = double payout + kho âm (TOCTOU).
--   D) RPC được GRANT cho anon -> anon key nằm công khai trong bundle web, và hàm nhận
--      p_user_id tuỳ ý -> ai cũng ép bán sạch kho người khác (đảo ngược chính sách 0054).
--
-- CÁCH SỬA — GIÁ SUY RA, KHÔNG LƯU (Luật 10: một con số = một nguồn):
--   giá_bán = items.price × 0.5 × multiplier(item_id, block_4h)
--                                 └── 0.70 … 1.50, tất định, GIỐNG HỆT src/lib/market.js
--   · Bán đỉnh = price × 0.75 < price  -> máy in tiền BẤT KHẢ THI VỀ CẤU TRÚC,
--     không phụ thuộc việc ai đó nhớ chỉnh bảng giá.
--   · Không còn bảng giá thứ hai -> không thể lệch ID (nguyên nhân A biến mất).
--   · Giá hiển thị = giá bán, vì cùng một công thức.
--   · Không cần scheduler -> bot tắt web vẫn đúng (hợp free-tier).
--   · 0.5 = đúng tỉ lệ bán lại của `sell_item` (0006) mà toàn bộ nghề/craft/sink đang cân quanh.
--
-- Idempotent. KHÔNG cần áp `0096_fix_market_item_ids.sql` nữa (đã vô hiệu — xem cuối file).
-- ============================================================

-- ------------------------------------------------------------
-- 1) HỆ SỐ BIẾN ĐỘNG — port nguyên văn hash 32-bit của src/lib/market.js
--    JS:  hash = (hash << 5) - hash + charCode   (tức hash*31 + c), cắt về int32 mỗi vòng
--         mult = 0.70 + (abs(hash) % 81) / 100
--    Postgres `integer` báo lỗi khi tràn, nên nhân trong bigint rồi tự gói về int32 thủ công.
--    `((x % 2^32) + 2^32) % 2^32` để mod luôn KHÔNG âm (Postgres % giữ dấu của số bị chia).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.market_multiplier(p_item_id TEXT, p_block TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_str  TEXT := p_item_id || ':' || p_block;
    v_hash BIGINT := 0;
    i      INT;
BEGIN
    FOR i IN 1..length(v_str) LOOP
        v_hash := v_hash * 31 + ascii(substr(v_str, i, 1));
        -- gói về int32 có dấu: [-2147483648, 2147483647]
        v_hash := (((v_hash + 2147483648) % 4294967296) + 4294967296) % 4294967296 - 2147483648;
    END LOOP;
    RETURN 0.70 + (abs(v_hash) % 81)::NUMERIC / 100;
END;
$$;

-- ------------------------------------------------------------
-- 2) BLOCK 4 GIỜ — port nguyên văn get4HourBlock() của src/lib/market.js
--    JS: `${UTCFullYear}-${dayOfYear}-${floor(UTCHours/4)}`  (dayOfYear đếm từ 1)
--    Bắt buộc dùng UTC ở CẢ bot, web và DB — nếu lệch múi giờ, ba nơi ra ba giá.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.market_block()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
    SELECT EXTRACT(YEAR  FROM (now() AT TIME ZONE 'UTC'))::INT || '-' ||
           EXTRACT(DOY   FROM (now() AT TIME ZONE 'UTC'))::INT || '-' ||
           (EXTRACT(HOUR FROM (now() AT TIME ZONE 'UTC'))::INT / 4)::INT;
$$;

-- ------------------------------------------------------------
-- 3) GIÁ CHỢ HIỆN TẠI của 1 item — nguồn sự thật DUY NHẤT cho việc bán
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.market_unit_price(p_item_id TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_catalog BIGINT;
BEGIN
    SELECT price INTO v_catalog FROM public.items WHERE id = p_item_id;
    IF v_catalog IS NULL OR v_catalog <= 0 THEN
        RETURN NULL;  -- item không tồn tại -> KHÔNG có nhánh dự phòng 500 xu nữa
    END IF;
    -- floor: không bao giờ làm tròn LÊN quá price*0.75 (giữ vòng kín tuyệt đối)
    RETURN GREATEST(1, floor(v_catalog * 0.5 * public.market_multiplier(p_item_id, public.market_block()))::BIGINT);
END;
$$;

-- ------------------------------------------------------------
-- 4) BÁN THEO GIÁ CHỢ — viết lại toàn bộ
--    Sửa: (B) giá suy ra · (C) FOR UPDATE + guard row-count · (D) search_path
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sell_item_market(
    p_user_id TEXT,
    p_item_id TEXT,
    p_amount INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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

    -- 1) KHOÁ DÒNG KHO trước khi quyết định (chống TOCTOU: 2 lời gọi song song
    --    cùng đọc quantity=5, cùng qua cửa, cùng được trả tiền -> kho âm + dupe tiền).
    SELECT quantity INTO v_inv_amount
    FROM public.inventory
    WHERE user_id = p_user_id AND item_id = p_item_id
    FOR UPDATE;

    IF v_inv_amount IS NULL OR v_inv_amount < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_ENOUGH_ITEMS',
                                  'available', COALESCE(v_inv_amount, 0));
    END IF;

    -- 2) Giá suy ra từ items.price — KHÔNG đọc bảng market_prices, KHÔNG fallback 500.
    v_unit_price := public.market_unit_price(p_item_id);
    IF v_unit_price IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ITEM_NOT_SELLABLE');
    END IF;

    v_total_earned := v_unit_price * p_amount;

    -- 3) Trừ kho CÓ ĐIỀU KIỆN + guard row-count (thắt lưng & dây đeo cùng FOR UPDATE).
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

    -- 4) Cộng ví nguyên tử.
    UPDATE public.users
    SET wallet = wallet + v_total_earned
    WHERE user_id = p_user_id
    RETURNING wallet INTO v_new_wallet;

    IF v_new_wallet IS NULL THEN
        -- Không có dòng users -> huỷ cả giao dịch, KHÔNG để mất vật phẩm mà không được trả tiền.
        RAISE EXCEPTION 'sell_item_market: không tìm thấy user %', p_user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'earned', v_total_earned,
        'unit_price', v_unit_price,
        'amount', p_amount,
        'new_wallet', v_new_wallet
    );
END;
$$;

-- ------------------------------------------------------------
-- 5) LEAST-PRIVILEGE (sửa D) — khôi phục chính sách của 0054.
--    Bot & web đều gọi bằng service_role nên KHÔNG bị ảnh hưởng.
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.sell_item_market(TEXT, TEXT, INT) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sell_item_market(TEXT, TEXT, INT) TO service_role;

-- market_multiplier/market_block/market_unit_price chỉ đọc `items` (dữ liệu công khai)
-- -> để anon đọc được cho trang giá web, nhưng KHÔNG ghi được gì.
GRANT EXECUTE ON FUNCTION public.market_multiplier(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.market_block()               TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.market_unit_price(TEXT)      TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 6) CHUỖI CHẾ TẠO: giữ "ghép đồ có lãi hơn bán nguyên liệu".
--    3× go bán đỉnh = 3 × floor(60×0.5×1.50) = 135;  tam_go bán = price×0.5.
--    tam_go 250 -> bán 125 < 135 = ghép LỖ. Nâng lên 300 -> bán 150 > 135. ✅
--    (thoi_sat 400 -> bán 200 > 3× quang_sat đỉnh 3×75=225?  200 < 225 -> nâng 500 -> 250 > 225 ✅)
-- ------------------------------------------------------------
UPDATE public.items SET price = 300 WHERE id = 'tam_go'   AND price < 300;
UPDATE public.items SET price = 500 WHERE id = 'thoi_sat' AND price < 500;

-- ------------------------------------------------------------
-- 7) DỌN DẸP: `market_prices` / `market_history` không còn được đọc bởi bất kỳ code nào.
--    KHÔNG DROP (luật forward-only + phòng khi cần đối chiếu lịch sử) — chỉ ghi chú lại
--    và gỡ quyền đọc để không ai vô tình xây tính năng mới dựa trên dữ liệu chết.
-- ------------------------------------------------------------
--    Bọc IF EXISTS: DB test chưa từng được áp 0095_market nên KHÔNG có 2 bảng này.
--    Migration phải chạy được trên MỌI môi trường, không giả định bảng luôn tồn tại.
DO $$
BEGIN
    IF to_regclass('public.market_prices') IS NOT NULL THEN
        EXECUTE 'COMMENT ON TABLE public.market_prices IS ''PHẾ THẢI từ 0098: giá chợ nay SUY RA qua market_unit_price(items.price × 0.5 × multiplier). Bảng này chưa từng có writer và chứa ID sai của 0095. Không đọc.''';
        EXECUTE 'REVOKE SELECT ON public.market_prices FROM anon, authenticated';
    END IF;
    IF to_regclass('public.market_history') IS NOT NULL THEN
        EXECUTE 'COMMENT ON TABLE public.market_history IS ''PHẾ THẢI từ 0098: chưa từng có writer nào ghi vào bảng này.''';
        EXECUTE 'REVOKE SELECT ON public.market_history FROM anon, authenticated';
    END IF;
END $$;

-- ============================================================
-- VERIFY — chạy sau khi áp. Cột `mult` PHẢI khớp tuyệt đối với JS.
-- Giá trị tham chiếu sinh từ src/lib/market.js (computeMarketMultiplier):
--
--   go              2026-225-3  -> 0.85      go              2026-1-0  -> 1.38
--   quang_sat       2026-225-3  -> 1.44      quang_sat       2026-1-0  -> 0.83
--   ky_nam          2026-225-3  -> 0.86      ky_nam          2026-1-0  -> 1.42
--   ca_koi_nhat     2026-225-3  -> 1.12      ca_koi_nhat     2026-1-0  -> 1.24
--   trai_1500       2026-225-3  -> 1.26      trai_1500       2026-1-0  -> 0.74
--   vang_dong_tren  2026-225-3  -> 1.30      vang_dong_tren  2026-1-0  -> 0.74
--   go              2026-366-5  -> 1.29      go              2025-100-2 -> 0.87
--   ca_koi_nhat     2026-366-5  -> 1.49      quang_sat       2025-100-2 -> 1.42
--
-- SELECT i.id, m.blk, public.market_multiplier(i.id, m.blk) AS mult
-- FROM (VALUES ('go'),('quang_sat'),('ky_nam'),('ca_koi_nhat'),('trai_1500'),('vang_dong_tren')) AS i(id),
--      (VALUES ('2026-225-3'),('2026-1-0'),('2026-366-5'),('2025-100-2')) AS m(blk)
-- ORDER BY m.blk, i.id;
--
-- -- Giá bán hiện tại + kiểm vòng kín (ban_dinh PHẢI < mua_store với mọi item mua được):
-- SELECT i.id, i.price AS mua_store, i.shop_hidden,
--        public.market_unit_price(i.id) AS ban_bay_gio,
--        floor(i.price * 0.5 * 1.50)::bigint AS ban_dinh,
--        CASE WHEN NOT i.shop_hidden AND floor(i.price*0.5*1.50) >= i.price
--             THEN '🔴 MÁY IN TIỀN' ELSE '✅' END AS trang_thai
-- FROM public.items i
-- WHERE i.id IN ('go','quang_sat','vang_dong_tren','ky_nam','ca_koi_nhat','ca_rong_vang',
--                'ca_tuoi','trai_1500','trai_2500','hoa_2000','hoa_3500','thit_heo_2500')
-- ORDER BY i.id;
--
-- -- Quyền: KHÔNG được còn anon/authenticated trên sell_item_market
-- SELECT proname, proacl FROM pg_proc WHERE proname = 'sell_item_market';
-- ============================================================

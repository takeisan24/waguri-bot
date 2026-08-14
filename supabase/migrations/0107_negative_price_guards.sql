-- ============================================================
-- 0107_negative_price_guards.sql — Chặn MÁY IN TIỀN qua GIÁ ÂM
--
-- 🔴 LỖ HỔNG (có từ 0029, phát hiện 2026-08-14 khi tự audit vòng 3):
-- `market_list` kiểm `p_qty <= 0` nhưng KHÔNG kiểm `p_price`. Còn `market_buy` làm:
--     update users set wallet = wallet - v_price where user_id = p_buyer and wallet >= v_price;
-- Với v_price = -1.000.000 thì `wallet >= -1000000` LUÔN ĐÚNG, và
-- `wallet - (-1000000)` = CỘNG THÊM 1.000.000 cho người mua.
--
-- ĐÃ CHỨNG MINH TRÊN DB TEST:
--     người mua : 1.000 -> 1.001.000   (+1.000.000, và NHẬN luôn vật phẩm)
--     người bán : 1.000 ->  -949.000   (-950.000, ví ÂM không giới hạn)
--     ròng      : +50.000 xu SINH RA TỪ KHÔNG KHÍ mỗi lần
-- Chính phí sàn 5% biến thành máy in. Lặp vô hạn với 2 tài khoản.
--
-- ĐƯỜNG VÀO: slash bị chặn bởi .setMinValue(MARKET.MIN_PRICE), nhưng ĐƯỜNG PREFIX
-- (`w!market list go -1000000 1`) không qua kiểm tra của Discord — parseOptions chỉ
-- làm Number(raw). Cùng lớp lỗi với `bad_qty` vừa vá ở f35d4d4.
--
-- Hệ đấu giá cùng lớp: `auction_create` không guard starting_bid/min_increment, và
-- `auction_bid` chỉ so `p_amount < v_min_required` — nếu phiên có giá khởi điểm ÂM
-- thì bid âm lọt qua, `wallet - (số âm)` lại cộng tiền.
--
-- ✅ PROD SẠCH tại thời điểm vá: 0 ví âm, 0 tin đăng giá âm, 0 phiên đấu giá âm.
--
-- CÁCH SỬA — 2 LỚP:
--   (A) Guard tường minh trong `market_list` (trả status `bad_price` để người chơi
--       nhận thông báo tử tế). Dựng lại từ `pg_get_functiondef()` của bản ĐANG CHẠY,
--       chỉ thêm ĐÚNG một dòng — không viết lại từ trí nhớ như lần suýt hỏng
--       delete_user_data.
--   (B) CHECK constraint ở tầng DỮ LIỆU cho phần còn lại. Ràng buộc không thể bị
--       lách bởi bất kỳ code nào, kể cả RPC viết sau này — mạnh hơn việc đi sửa
--       từng hàm, và tránh rủi ro viết lại 4 RPC đang chạy tốt.
--
-- Idempotent.
-- ============================================================

-- ---------- (A) market_list: guard giá + status mới `bad_price` ----------
CREATE OR REPLACE FUNCTION public.market_list(p_seller text, p_item text, p_qty integer, p_price bigint)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_have int; v_id bigint; v_upd int;
BEGIN
    IF p_qty <= 0 THEN RETURN jsonb_build_object('status','bad_qty'); END IF;
    -- DÒNG DUY NHẤT ĐƯỢC THÊM so với bản đang chạy: chặn giá <= 0.
    IF p_price IS NULL OR p_price <= 0 THEN RETURN jsonb_build_object('status','bad_price'); END IF;
    SELECT coalesce(quantity,0) INTO v_have FROM inventory WHERE user_id = p_seller AND item_id = p_item FOR UPDATE;
    IF coalesce(v_have,0) < p_qty THEN RETURN jsonb_build_object('status','poor_item'); END IF;
    UPDATE inventory SET quantity = quantity - p_qty WHERE user_id = p_seller AND item_id = p_item AND quantity >= p_qty;
    GET DIAGNOSTICS v_upd = row_count;
    IF v_upd = 0 THEN RETURN jsonb_build_object('status','poor_item'); END IF;
    DELETE FROM inventory WHERE user_id = p_seller AND item_id = p_item AND quantity <= 0;
    INSERT INTO market_listings(seller_id, item_id, qty, price) VALUES (p_seller, p_item, p_qty, p_price) RETURNING id INTO v_id;
    RETURN jsonb_build_object('status','ok','id', v_id);
END; $function$;

-- ---------- (B) Ràng buộc ở tầng dữ liệu ----------
-- Không thể lách bằng bất kỳ RPC nào, hiện tại hay tương lai.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='market_listings_price_positive') THEN
        ALTER TABLE public.market_listings
            ADD CONSTRAINT market_listings_price_positive CHECK (price > 0);
    END IF;

    IF to_regclass('public.auctions') IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='auctions_bid_positive') THEN
            ALTER TABLE public.auctions
                ADD CONSTRAINT auctions_bid_positive
                CHECK (starting_bid > 0 AND min_increment > 0 AND (current_bid IS NULL OR current_bid >= 0));
        END IF;
    END IF;

    -- Chốt chặn TOÀN CỤC: số dư không bao giờ được âm. Mọi RPC tiền hiện có đều đã
    -- guard `wallet >= amount` nên ràng buộc này KHÔNG chạm đường chơi bình thường;
    -- nó chỉ nổ đúng lúc có bug — biến hỏng-âm-thầm thành lỗi-ồn-ào.
    -- Prod đã kiểm: 0 dòng vi phạm trước khi thêm.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_balance_non_negative') THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_balance_non_negative
            CHECK (wallet >= 0 AND bank >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inventory_quantity_non_negative') THEN
        ALTER TABLE public.inventory
            ADD CONSTRAINT inventory_quantity_non_negative CHECK (quantity >= 0);
    END IF;
END $$;

-- ============================================================
-- VERIFY:
--   SELECT public.market_list('u','go',1,-1000);        -- {"status":"bad_price"}
--   INSERT INTO market_listings(seller_id,item_id,qty,price)
--     VALUES ('u','go',1,-5);                            -- PHẢI lỗi CHECK
--   UPDATE users SET wallet = -1 WHERE user_id='...';    -- PHẢI lỗi CHECK
--   SELECT conname FROM pg_constraint WHERE conname IN
--     ('market_listings_price_positive','auctions_bid_positive',
--      'users_balance_non_negative','inventory_quantity_non_negative');  -- 4 dòng
-- ============================================================

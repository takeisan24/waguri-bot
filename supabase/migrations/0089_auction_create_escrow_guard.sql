-- ============================================================
-- 0089_auction_create_escrow_guard.sql — C1: chặn NHÂN BẢN VẬT PHẨM ở auction_create.
--
--   Bản 0086 kiểm kho bằng SELECT ... INTO v_have KHÔNG có FOR UPDATE, và trừ kho bằng
--   "UPDATE inventory SET quantity = quantity - p_qty" KHÔNG guard quantity >= p_qty,
--   KHÔNG kiểm row-count. Hai lần /market auction chạy song song (double-click) cùng
--   đọc thấy đủ hàng -> T1 trừ 5->0 và xoá dòng, T2 trừ TRƯỢT 0 dòng (im lặng) nhưng
--   VẪN INSERT phiên đấu giá -> 2 phiên cùng giao 5 item = +5 item sinh ra từ hư không.
--   (Đúng lớp lỗi đã vá cho sell_item/quest_claim ở 0087, nhưng auction_create viết
--   trước nên bị sót.)
--
--   Vá:
--     1) SELECT ... FOR UPDATE  -> khoá dòng kho, phiên thứ 2 phải chờ và đọc lại số thật.
--     2) UPDATE ... AND quantity >= p_qty + GET DIAGNOSTICS row_count -> nếu trừ trượt
--        thì RAISE để rollback CẢ phí đã trừ (không bao giờ tạo phiên mà chưa ký quỹ hàng).
--     3) DELETE dọn dòng rỗng giới hạn đúng item_id (bản cũ xoá mọi dòng quantity<=0 của user).
--   Giữ nguyên chữ ký, SECURITY DEFINER và search_path -> grants hiện có được bảo toàn.
-- ============================================================
CREATE OR REPLACE FUNCTION auction_create(
    p_seller TEXT,
    p_item TEXT,
    p_qty INT,
    p_starting_bid BIGINT,
    p_min_increment BIGINT,
    p_hours INT,
    p_fee BIGINT,
    p_guild TEXT,
    p_channel TEXT
) RETURNS JSONB LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_have INT;
    v_id BIGINT;
    v_upd INT;
BEGIN
    -- (1) Khoá dòng kho của người bán trước khi kiểm tra. Không có dòng -> v_have NULL -> poor_item.
    SELECT COALESCE(quantity, 0) INTO v_have
        FROM inventory
        WHERE user_id = p_seller AND item_id = p_item
        FOR UPDATE;
    IF COALESCE(v_have, 0) < p_qty THEN
        RETURN jsonb_build_object('status', 'poor_item');
    END IF;

    UPDATE users SET wallet = wallet - p_fee WHERE user_id = p_seller AND wallet >= p_fee;
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd = 0 THEN
        RETURN jsonb_build_object('status', 'poor_fee');
    END IF;

    -- (2) Ký quỹ hàng: có guard + kiểm row-count. Đang giữ FOR UPDATE nên về lý thuyết
    -- luôn thành công; RAISE là chốt chặn cuối, rollback luôn phí vừa trừ ở trên.
    UPDATE inventory SET quantity = quantity - p_qty
        WHERE user_id = p_seller AND item_id = p_item AND quantity >= p_qty;
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd = 0 THEN
        RAISE EXCEPTION 'auction_create: escrow failed for % x% (concurrent modification)', p_item, p_qty;
    END IF;

    -- (3) Dọn dòng rỗng — chỉ đúng item vừa trừ.
    DELETE FROM inventory WHERE user_id = p_seller AND item_id = p_item AND quantity <= 0;

    INSERT INTO auctions (
        seller_id, item_id, qty, starting_bid, min_increment, current_bid,
        original_ends_at, ends_at, guild_id, channel_id
    ) VALUES (
        p_seller, p_item, p_qty, p_starting_bid, p_min_increment, 0,
        now() + (p_hours || ' hours')::interval, now() + (p_hours || ' hours')::interval,
        p_guild, p_channel
    ) RETURNING id INTO v_id;

    RETURN jsonb_build_object('status', 'ok', 'id', v_id);
END;
$$;

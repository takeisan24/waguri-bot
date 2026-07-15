-- ============================================================
-- 0086_advanced_auctions.sql — Chợ đấu giá nâng cao (Advanced Auctions)
-- ------------------------------------------------------------
-- Tạo bảng auctions và các hàm RPC đấu giá an toàn giao dịch
-- ============================================================

-- ---------- 1) Tạo bảng auctions ----------
CREATE TABLE IF NOT EXISTS auctions (
    id             bigserial PRIMARY KEY,
    seller_id      TEXT NOT NULL REFERENCES users(user_id),
    item_id        TEXT NOT NULL,
    qty            INT NOT NULL CHECK (qty > 0),
    starting_bid   BIGINT NOT NULL CHECK (starting_bid >= 100 AND starting_bid <= 9000000000000000),
    min_increment  BIGINT NOT NULL CHECK (min_increment >= 10 AND min_increment <= 9000000000000000),
    current_bid    BIGINT NOT NULL CHECK (current_bid >= 0 AND current_bid <= 9000000000000000),
    highest_bidder_id TEXT REFERENCES users(user_id),
    original_ends_at TIMESTAMPTZ NOT NULL,
    ends_at        TIMESTAMPTZ NOT NULL,
    guild_id       TEXT NOT NULL,
    channel_id     TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_auctions_active ON auctions(status, ends_at);

-- ---------- 2) Hàm RPC auction_create ----------
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
    SELECT COALESCE(quantity, 0) INTO v_have FROM inventory WHERE user_id = p_seller AND item_id = p_item;
    IF COALESCE(v_have, 0) < p_qty THEN
        RETURN jsonb_build_object('status', 'poor_item');
    END IF;

    UPDATE users SET wallet = wallet - p_fee WHERE user_id = p_seller AND wallet >= p_fee;
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd = 0 THEN
        RETURN jsonb_build_object('status', 'poor_fee');
    END IF;

    UPDATE inventory SET quantity = quantity - p_qty WHERE user_id = p_seller AND item_id = p_item;
    DELETE FROM inventory WHERE user_id = p_seller AND quantity <= 0;

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

-- ---------- 3) Hàm RPC auction_bid ----------
CREATE OR REPLACE FUNCTION auction_bid(
    p_bidder TEXT,
    p_auction BIGINT,
    p_amount BIGINT
) RETURNS JSONB LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_seller TEXT;
    v_item TEXT;
    v_qty INT;
    v_starting_bid BIGINT;
    v_min_increment BIGINT;
    v_current_bid BIGINT;
    v_highest_bidder_id TEXT;
    v_original_ends_at TIMESTAMPTZ;
    v_ends_at TIMESTAMPTZ;
    v_status TEXT;
    v_min_required BIGINT;
    v_upd INT;
BEGIN
    SELECT seller_id, item_id, qty, starting_bid, min_increment, current_bid, highest_bidder_id, original_ends_at, ends_at, status
    INTO v_seller, v_item, v_qty, v_starting_bid, v_min_increment, v_current_bid, v_highest_bidder_id, v_original_ends_at, v_ends_at, v_status
    FROM auctions WHERE id = p_auction FOR UPDATE;

    IF v_seller IS NULL THEN
        RETURN jsonb_build_object('status', 'notfound');
    END IF;

    IF v_status <> 'active' THEN
        RETURN jsonb_build_object('status', 'not_active');
    END IF;

    IF v_ends_at <= now() THEN
        RETURN jsonb_build_object('status', 'ended');
    END IF;

    IF v_seller = p_bidder THEN
        RETURN jsonb_build_object('status', 'own');
    END IF;

    IF COALESCE(v_highest_bidder_id, '') = p_bidder THEN
        RETURN jsonb_build_object('status', 'highest');
    END IF;

    IF v_highest_bidder_id IS NULL THEN
        v_min_required := v_starting_bid;
    ELSE
        v_min_required := v_current_bid + v_min_increment;
    END IF;

    IF p_amount < v_min_required THEN
        RETURN jsonb_build_object('status', 'low_bid', 'min_required', v_min_required);
    END IF;

    -- Khấu trừ tiền bidder mới
    INSERT INTO users(user_id) VALUES(p_bidder) ON CONFLICT(user_id) DO NOTHING;
    UPDATE users SET wallet = wallet - p_amount WHERE user_id = p_bidder AND wallet >= p_amount;
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd = 0 THEN
        RETURN jsonb_build_object('status', 'poor', 'amount', p_amount);
    END IF;

    -- Hoàn tiền cho bidder cũ
    IF v_highest_bidder_id IS NOT NULL THEN
        UPDATE users SET wallet = wallet + v_current_bid WHERE user_id = v_highest_bidder_id;
    END IF;

    -- Cập nhật auction
    UPDATE auctions SET
        current_bid = p_amount,
        highest_bidder_id = p_bidder
    WHERE id = p_auction;

    -- Anti-sniping: gia hạn thêm 3 phút nếu thời gian còn dưới 3 phút
    IF v_ends_at - now() < interval '3 minutes' THEN
        -- Giới hạn không quá original_ends_at + 1h
        IF now() + interval '3 minutes' <= v_original_ends_at + interval '1 hour' THEN
            UPDATE auctions SET ends_at = now() + interval '3 minutes' WHERE id = p_auction RETURNING ends_at INTO v_ends_at;
        ELSE
            UPDATE auctions SET ends_at = v_original_ends_at + interval '1 hour' WHERE id = p_auction RETURNING ends_at INTO v_ends_at;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'status', 'ok',
        'previous_bidder_id', v_highest_bidder_id,
        'previous_bid_amount', v_current_bid,
        'ends_at', to_json(v_ends_at)
    );
END;
$$;

-- ---------- 4) Hàm RPC auction_cancel ----------
CREATE OR REPLACE FUNCTION auction_cancel(
    p_seller TEXT,
    p_auction BIGINT
) RETURNS JSONB LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_seller TEXT;
    v_item TEXT;
    v_qty INT;
    v_highest_bidder_id TEXT;
    v_status TEXT;
BEGIN
    SELECT seller_id, item_id, qty, highest_bidder_id, status
    INTO v_seller, v_item, v_qty, v_highest_bidder_id, v_status
    FROM auctions WHERE id = p_auction FOR UPDATE;

    IF v_seller IS NULL THEN
        RETURN jsonb_build_object('status', 'notfound');
    END IF;

    IF v_seller <> p_seller THEN
        RETURN jsonb_build_object('status', 'notyours');
    END IF;

    IF v_status <> 'active' THEN
        RETURN jsonb_build_object('status', 'not_active');
    END IF;

    IF v_highest_bidder_id IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'has_bids');
    END IF;

    -- Hoàn trả vật phẩm về kho người bán
    UPDATE inventory SET quantity = quantity + v_qty WHERE user_id = p_seller AND item_id = v_item;
    IF NOT FOUND THEN
        INSERT INTO inventory(id, user_id, item_id, quantity) VALUES (gen_random_uuid(), p_seller, v_item, v_qty);
    END IF;

    UPDATE auctions SET status = 'cancelled' WHERE id = p_auction;

    RETURN jsonb_build_object('status', 'ok', 'item', v_item, 'qty', v_qty);
END;
$$;

-- ---------- 5) Hàm RPC auction_resolve_expired ----------
CREATE OR REPLACE FUNCTION auction_resolve_expired(p_tax_rate NUMERIC)
RETURNS JSONB LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_rec RECORD;
    v_net BIGINT;
    v_tax BIGINT;
    v_resolved_list JSONB := jsonb_build_array();
BEGIN
    FOR v_rec IN 
        SELECT id, seller_id, item_id, qty, current_bid, highest_bidder_id, guild_id, channel_id
        FROM auctions 
        WHERE status = 'active' AND ends_at <= now()
        FOR UPDATE
    LOOP
        IF v_rec.highest_bidder_id IS NULL THEN
            -- Không có ai bid: Trả đồ về kho người bán
            UPDATE inventory SET quantity = quantity + v_rec.qty WHERE user_id = v_rec.seller_id AND item_id = v_rec.item_id;
            IF NOT FOUND THEN
                INSERT INTO inventory(id, user_id, item_id, quantity) VALUES (gen_random_uuid(), v_rec.seller_id, v_rec.item_id, v_rec.qty);
            END IF;

            UPDATE auctions SET status = 'ended' WHERE id = v_rec.id;

            v_resolved_list := v_resolved_list || jsonb_build_object(
                'id', v_rec.id,
                'seller_id', v_rec.seller_id,
                'item_id', v_rec.item_id,
                'qty', v_rec.qty,
                'current_bid', 0,
                'highest_bidder_id', NULL,
                'guild_id', v_rec.guild_id,
                'channel_id', v_rec.channel_id,
                'outcome', 'no_bids'
            );
        ELSE
            -- Có người thắng: Chuyển đồ sang người thắng
            UPDATE inventory SET quantity = quantity + v_rec.qty WHERE user_id = v_rec.highest_bidder_id AND item_id = v_rec.item_id;
            IF NOT FOUND THEN
                INSERT INTO inventory(id, user_id, item_id, quantity) VALUES (gen_random_uuid(), v_rec.highest_bidder_id, v_rec.item_id, v_rec.qty);
            END IF;

            -- Chuyển tiền sau thuế cho người bán
            v_tax := floor(v_rec.current_bid * p_tax_rate);
            v_net := v_rec.current_bid - v_tax;
            UPDATE users SET wallet = wallet + v_net WHERE user_id = v_rec.seller_id;

            UPDATE auctions SET status = 'ended' WHERE id = v_rec.id;

            v_resolved_list := v_resolved_list || jsonb_build_object(
                'id', v_rec.id,
                'seller_id', v_rec.seller_id,
                'item_id', v_rec.item_id,
                'qty', v_rec.qty,
                'current_bid', v_rec.current_bid,
                'highest_bidder_id', v_rec.highest_bidder_id,
                'guild_id', v_rec.guild_id,
                'channel_id', v_rec.channel_id,
                'net_payout', v_net,
                'tax_fee', v_tax,
                'outcome', 'sold'
            );
        END IF;
    END LOOP;

    RETURN v_resolved_list;
END;
$$;

-- ---------- 6) Cập nhật hàm delete_user_data ----------
CREATE OR REPLACE FUNCTION delete_user_data(p_user_id TEXT)
RETURNS TEXT LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Chặn: còn khoản vay chưa tất toán (là bên vay HOẶC bên cho vay)
    IF EXISTS (SELECT 1 FROM loans WHERE status = 'active' AND (lender_id = p_user_id OR borrower_id = p_user_id)) THEN
        RETURN 'blocked_loans';
    END IF;
    -- Chặn: đang là chủ (leader) của một clan
    IF EXISTS (SELECT 1 FROM clans WHERE leader_id = p_user_id) THEN
        RETURN 'blocked_clan_leader';
    END IF;
    -- Chặn: đang có đấu giá hoạt động ở vai trò seller
    IF EXISTS (SELECT 1 FROM auctions WHERE seller_id = p_user_id AND status = 'active') THEN
        RETURN 'blocked_active_auctions';
    END IF;
    -- Chặn: đang là người đặt giá cao nhất ở đấu giá hoạt động của người khác
    IF EXISTS (SELECT 1 FROM auctions WHERE highest_bidder_id = p_user_id AND status = 'active') THEN
        RETURN 'blocked_active_bids';
    END IF;

    -- Gỡ liên kết bạn đời để không để lại tham chiếu treo ở phía người kia
    UPDATE users SET partner_id = NULL, married_at = NULL WHERE partner_id = p_user_id;

    -- Xoá dữ liệu chơi cá nhân (con trước — inventory/cooldowns/police_heat có FK tới users)
    DELETE FROM inventory       WHERE user_id = p_user_id;
    DELETE FROM cooldowns       WHERE user_id = p_user_id;
    DELETE FROM police_heat     WHERE user_id = p_user_id;
    DELETE FROM quest_progress  WHERE user_id = p_user_id;
    DELETE FROM achievements    WHERE user_id = p_user_id;
    DELETE FROM user_pets       WHERE user_id = p_user_id;
    DELETE FROM pigs            WHERE user_id = p_user_id;
    DELETE FROM plants          WHERE user_id = p_user_id;
    DELETE FROM bakeries        WHERE user_id = p_user_id;
    DELETE FROM daily_counters  WHERE user_id = p_user_id;
    DELETE FROM guild_members   WHERE user_id = p_user_id;
    DELETE FROM lottery_tickets WHERE user_id = p_user_id;
    DELETE FROM game_stakes     WHERE user_id = p_user_id;
    DELETE FROM market_listings WHERE seller_id = p_user_id;
    
    -- Xoá các phiên đấu giá đã kết thúc hoặc bị huỷ liên quan tới người dùng này
    DELETE FROM auctions        WHERE (seller_id = p_user_id OR highest_bidder_id = p_user_id) AND status <> 'active';

    -- GIỮ LẠI (lợi ích hợp pháp): premium_orders (đối soát), confession_logs (điều tra abuse)

    DELETE FROM users WHERE user_id = p_user_id;

    RETURN 'ok';
END;
$$;

-- ---------- 7) Bảo mật các hàm RPC ----------
REVOKE EXECUTE ON FUNCTION auction_create(TEXT, TEXT, INT, BIGINT, BIGINT, INT, BIGINT, TEXT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION auction_create(TEXT, TEXT, INT, BIGINT, BIGINT, INT, BIGINT, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION auction_bid(TEXT, BIGINT, BIGINT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION auction_bid(TEXT, BIGINT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION auction_cancel(TEXT, BIGINT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION auction_cancel(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION auction_resolve_expired(NUMERIC) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION auction_resolve_expired(NUMERIC) TO service_role;

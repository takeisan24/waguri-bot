-- ============================================================
-- 0029_market.sql — Chợ mua bán vật phẩm giữa người chơi (P2P)
-- Ký gửi (escrow): đăng bán -> đồ rời kho người bán; mua -> đồ sang người mua,
-- tiền sang người bán (chợ cắt %); huỷ -> trả đồ về.
-- ============================================================

create table if not exists market_listings (
    id         bigserial primary key,
    seller_id  text not null,
    item_id    text not null,
    qty        int not null,
    price      bigint not null,        -- tổng giá cho cả lô
    created_at timestamptz not null default now(),
    status     text not null default 'active'  -- 'active' | 'sold' | 'cancelled'
);
create index if not exists idx_market_active on market_listings(status, created_at);

-- Đăng bán: kiểm tra đủ đồ -> rời kho -> tạo listing.
create or replace function market_list(p_seller text, p_item text, p_qty int, p_price bigint)
returns jsonb language plpgsql as $$
declare v_have int; v_id bigint;
begin
    select coalesce(quantity,0) into v_have from inventory where user_id = p_seller and item_id = p_item;
    if coalesce(v_have,0) < p_qty then return jsonb_build_object('status','poor_item'); end if;
    update inventory set quantity = quantity - p_qty where user_id = p_seller and item_id = p_item;
    delete from inventory where user_id = p_seller and quantity <= 0;
    insert into market_listings(seller_id, item_id, qty, price) values (p_seller, p_item, p_qty, p_price) returning id into v_id;
    return jsonb_build_object('status','ok','id', v_id);
end; $$;

-- Mua: trừ tiền người mua -> cộng người bán (trừ phí chợ) -> giao đồ -> đóng listing.
create or replace function market_buy(p_buyer text, p_listing bigint, p_fee numeric)
returns jsonb language plpgsql as $$
declare v_seller text; v_item text; v_qty int; v_price bigint; v_status text; v_upd int; v_net bigint;
begin
    select seller_id, item_id, qty, price, status into v_seller, v_item, v_qty, v_price, v_status
        from market_listings where id = p_listing for update;
    if v_seller is null then return jsonb_build_object('status','notfound'); end if;
    if v_status <> 'active' then return jsonb_build_object('status','gone'); end if;
    if v_seller = p_buyer then return jsonb_build_object('status','own'); end if;

    insert into users(user_id) values(p_buyer) on conflict(user_id) do nothing;
    update users set wallet = wallet - v_price where user_id = p_buyer and wallet >= v_price;
    get diagnostics v_upd = row_count;
    if v_upd = 0 then return jsonb_build_object('status','poor','price', v_price); end if;

    v_net := floor(v_price * (1 - p_fee));
    update users set wallet = wallet + v_net where user_id = v_seller;

    update inventory set quantity = quantity + v_qty where user_id = p_buyer and item_id = v_item;
    if not found then insert into inventory(id, user_id, item_id, quantity) values (gen_random_uuid(), p_buyer, v_item, v_qty); end if;

    update market_listings set status = 'sold' where id = p_listing;
    return jsonb_build_object('status','ok','item', v_item, 'qty', v_qty, 'price', v_price, 'net', v_net, 'seller', v_seller);
end; $$;

-- Huỷ: trả đồ về kho người bán.
create or replace function market_cancel(p_seller text, p_listing bigint)
returns jsonb language plpgsql as $$
declare v_seller text; v_item text; v_qty int; v_status text;
begin
    select seller_id, item_id, qty, status into v_seller, v_item, v_qty, v_status
        from market_listings where id = p_listing for update;
    if v_seller is null then return jsonb_build_object('status','notfound'); end if;
    if v_seller <> p_seller then return jsonb_build_object('status','notyours'); end if;
    if v_status <> 'active' then return jsonb_build_object('status','gone'); end if;

    update inventory set quantity = quantity + v_qty where user_id = p_seller and item_id = v_item;
    if not found then insert into inventory(id, user_id, item_id, quantity) values (gen_random_uuid(), p_seller, v_item, v_qty); end if;
    update market_listings set status = 'cancelled' where id = p_listing;
    return jsonb_build_object('status','ok','item', v_item, 'qty', v_qty);
end; $$;

-- Migration 0096: Sửa item_id trong market_prices khớp với items table thực tế
-- Lý do: 9/12 item_id ban đầu (migration 0095) không khớp với items.id
-- khiến RPC sell_item_market không tìm thấy vật phẩm trong inventory

-- Xóa dữ liệu cũ với ID sai
DELETE FROM public.market_prices WHERE item_id IN (
    'lua_nuoc', 'ca_chua', 'khoai_tay', 'dua_hau',
    'ca_koi', 'ca_rong', 'sieu_cap_gem', 'vang_dong_trieu', 'go_ram'
);

-- Chèn lại với ID đúng (idempotent)
INSERT INTO public.market_prices (item_id, base_price, current_price, multiplier, trend)
VALUES
    ('trai_1500', 1500, 1500, 1.00, 'STABLE'),
    ('trai_2500', 2500, 2500, 1.00, 'STABLE'),
    ('hoa_2000', 2000, 2000, 1.00, 'STABLE'),
    ('hoa_3500', 3500, 3500, 1.00, 'STABLE'),
    ('ca_koi_nhat', 5000, 5000, 1.00, 'STABLE'),
    ('ca_rong_vang', 15000, 15000, 1.00, 'STABLE'),
    ('quang_sat', 800, 800, 1.00, 'STABLE'),
    ('vang_dong_tren', 20000, 20000, 1.00, 'STABLE'),
    ('go', 400, 400, 1.00, 'STABLE')
ON CONFLICT (item_id) DO NOTHING;

-- Đảm bảo 3 item đúng từ đầu vẫn còn (idempotent)
INSERT INTO public.market_prices (item_id, base_price, current_price, multiplier, trend)
VALUES
    ('thit_heo_2500', 2500, 2500, 1.00, 'STABLE'),
    ('ca_tuoi', 600, 600, 1.00, 'STABLE'),
    ('ky_nam', 25000, 25000, 1.00, 'STABLE')
ON CONFLICT (item_id) DO NOTHING;

-- Xóa lịch sử giao dịch với ID cũ (không còn hợp lệ)
DELETE FROM public.market_history WHERE item_id IN (
    'lua_nuoc', 'ca_chua', 'khoai_tay', 'dua_hau',
    'ca_koi', 'ca_rong', 'sieu_cap_gem', 'vang_dong_trieu', 'go_ram'
);

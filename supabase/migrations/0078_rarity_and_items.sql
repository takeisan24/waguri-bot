-- 0078_rarity_and_items.sql
-- Thêm cột độ hiếm, tạo bảng cho hệ thống Album sưu tập, phân loại 82 item hiện tại và thêm 6 item mới.

-- 1. Thêm cột rarity vào bảng items
ALTER TABLE items ADD COLUMN IF NOT EXISTS rarity TEXT DEFAULT 'common';

-- 2. Tạo bảng user_discoveries (lịch sử tự tay thu thập item của người chơi)
CREATE TABLE IF NOT EXISTS public.user_discoveries (
    user_id TEXT REFERENCES public.users(user_id) ON DELETE CASCADE,
    item_id TEXT REFERENCES public.items(id) ON DELETE CASCADE,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, item_id)
);

-- Bật RLS cho user_discoveries
ALTER TABLE public.user_discoveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cho phép đọc mọi lúc" ON public.user_discoveries FOR SELECT USING (true);
CREATE POLICY "Cho phép service_role ghi/xóa" ON public.user_discoveries FOR ALL USING (true) WITH CHECK (true);

-- 3. Tạo bảng user_collection_rewards (lịch sử đã nhận thưởng album)
CREATE TABLE IF NOT EXISTS public.user_collection_rewards (
    user_id TEXT REFERENCES public.users(user_id) ON DELETE CASCADE,
    set_id TEXT NOT NULL,
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, set_id)
);

-- Bật RLS cho user_collection_rewards
ALTER TABLE public.user_collection_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cho phép đọc mọi lúc" ON public.user_collection_rewards FOR SELECT USING (true);
CREATE POLICY "Cho phép service_role ghi/xóa" ON public.user_collection_rewards FOR ALL USING (true) WITH CHECK (true);

-- 4. RPC claim_collection_reward: nhận thưởng album nguyên tử
CREATE OR REPLACE FUNCTION public.claim_collection_reward(
    p_user TEXT,
    p_set_id TEXT,
    p_required_items TEXT[],
    p_reward_coins BIGINT,
    p_title TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item TEXT;
    v_wallet BIGINT;
    v_has_claimed BOOLEAN;
BEGIN
    -- 1. Khóa dòng user (chống race condition)
    SELECT wallet INTO v_wallet FROM users WHERE user_id = p_user FOR UPDATE;
    IF v_wallet IS NULL THEN
        RETURN 'user_not_found';
    END IF;

    -- 2. Kiểm tra xem đã nhận thưởng chưa
    SELECT EXISTS(SELECT 1 FROM user_collection_rewards WHERE user_id = p_user AND set_id = p_set_id) INTO v_has_claimed;
    IF v_has_claimed THEN
        RETURN 'already_claimed';
    END IF;

    -- 3. Kiểm tra xem đã mở khóa đủ mọi item yêu cầu chưa
    FOREACH v_item IN ARRAY p_required_items LOOP
        IF NOT EXISTS (SELECT 1 FROM user_discoveries WHERE user_id = p_user AND item_id = v_item) THEN
            RETURN 'not_completed';
        END IF;
    END LOOP;

    -- 4. Ghi nhận nhận thưởng
    INSERT INTO user_collection_rewards (user_id, set_id) VALUES (p_user, p_set_id);

    -- 5. Cộng tiền thưởng
    UPDATE users SET wallet = wallet + p_reward_coins WHERE user_id = p_user;

    -- 6. Cập nhật danh hiệu (nêu có)
    IF p_title IS NOT NULL AND p_title <> '' THEN
        UPDATE users SET title = p_title WHERE user_id = p_user;
    END IF;

    RETURN 'ok';
END;
$$;

-- Phân quyền RPC
REVOKE ALL ON FUNCTION public.claim_collection_reward(TEXT, TEXT, TEXT[], BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_collection_reward(TEXT, TEXT, TEXT[], BIGINT, TEXT) TO service_role;

-- 5. Cập nhật độ hiếm (rarity) cho 82 vật phẩm hiện tại

-- Legendary (Huyền thoại)
UPDATE items SET rarity = 'legendary' WHERE id IN ('sieu_xe', 'du_thuyen', 'biet_thu', 'thit_heo_holo');

-- Epic (Sử thi)
UPDATE items SET rarity = 'epic' WHERE id IN ('mercedes', 'o_to_cu', 'tui_hermes', 'dong_ho_saku', 'can_ho', 'sh', 'ban_phim_co', 'may_anh', 'laptop', 've_dai_gia', 've_vip');

-- Rare (Hiếm)
UPDATE items SET rarity = 'rare' WHERE id IN ('xe_vespa', 'bo_lam_banh', 'gau_bong', 'banh_flan', 'ca_hiem', 'thit_heo_4000', 'thit_heo_3500', 'trai_3500', 'hoa_3500', 'noi_that', 'trang_suc', 'hop_qua');

-- Uncommon (Bất thường)
UPDATE items SET rarity = 'uncommon' WHERE id IN (
    'xe_wave', 'banh_su_kem', 'bo_hoa', 'ca_ngon', 'ca_phe_trung', 'banh_chung', 'banh_trung_thu', 'thoi_sat', 'tam_go', 
    'cuoc_sat', 'riu_sat', 'can_cau', 'bh_hoc_duong', 'bh_lao_dong', 'soda_gekka', 'mu_noi', 'the_sinh_vien', 
    'thit_heo_3000', 'thit_heo_2500', 'trai_3000', 'trai_2500', 'hoa_3000', 'hoa_2500'
);

-- Common (Thường): Các vật phẩm còn lại đã mặc định là 'common' do DEFAULT 'common'.
-- Nhưng ta cập nhật thêm category bị null của một số món mới để đồng bộ wiki.
UPDATE items SET category = 'bakery' WHERE id IN ('banh_su_kem', 'banh_flan');
UPDATE items SET category = 'farm' WHERE id IN ('ca_ngon', 'ca_hiem');
UPDATE items SET category = 'gift' WHERE id IN ('bo_hoa', 'hop_qua', 'gau_bong');

-- 6. Thêm 6 vật phẩm mới
INSERT INTO items (id, name, type, category, price, description, rarity) VALUES
('ca_rong_vang', 'Cá Rồng Kim Long', 'material', 'farm', 20000, 'Loài cá phong thủy siêu quý hiếm, mang lại tài lộc. Có thể dùng làm nhân bánh ngọt/mặn cao cấp tại tiệm Gekka.', 'epic')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, description = EXCLUDED.description, rarity = EXCLUDED.rarity;

INSERT INTO items (id, name, type, category, price, description, rarity) VALUES
('ca_koi_nhat', 'Cá Koi Hoàng Gia', 'material', 'farm', 80000, 'Loài cá truyền thuyết có hoa văn tuyệt đẹp từ Nhật Bản. Có thể bán lấy tiền hoặc nạp nguyên liệu siêu cấp.', 'legendary')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, description = EXCLUDED.description, rarity = EXCLUDED.rarity;

INSERT INTO items (id, name, type, category, price, description, rarity) VALUES
('vang_dong_tren', 'Vàng Đông Triều', 'material', 'material', 5000, 'Quặng vàng nguyên chất khai thác từ vùng mỏ Đông Triều. Dùng để chế tạo vương miện hoặc bán giá cao.', 'rare')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, description = EXCLUDED.description, rarity = EXCLUDED.rarity;

INSERT INTO items (id, name, type, category, price, description, rarity) VALUES
('ky_nam', 'Kỳ Nam', 'material', 'material', 15000, 'Loại gỗ trầm hương thượng hạng tích tụ linh khí đất trời. Dùng làm vòng tay phong thủy hoặc bán kiếm lời.', 'epic')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, description = EXCLUDED.description, rarity = EXCLUDED.rarity;

INSERT INTO items (id, name, type, category, price, description, rarity) VALUES
('tram_huong_vong', 'Vòng Tay Trầm Hương', 'misc', 'luxury', 45000, 'Chiếc vòng trầm hương thơm dịu nhẹ chế tác tỉ mỉ. Tặng người khác hoặc Waguri để tăng thiện cảm lớn (+50).', 'epic')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, description = EXCLUDED.description, rarity = EXCLUDED.rarity;

INSERT INTO items (id, name, type, category, price, description, rarity) VALUES
('vuong_mieng_gold', 'Vương Miện Đá Quý', 'misc', 'luxury', 120000, 'Vương miện lộng lẫy bằng vàng Đông Triều đính đầy đá quý. Siêu phẩm thể hiện đẳng cấp hoàng gia.', 'legendary')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, description = EXCLUDED.description, rarity = EXCLUDED.rarity;

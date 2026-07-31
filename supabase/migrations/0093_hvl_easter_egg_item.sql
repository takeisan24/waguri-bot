-- 0093_hvl_easter_egg_item.sql
-- 1. Thêm cột bio vào bảng users cho tính năng Hồ Sơ Cá Nhân
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';

-- 2. Thêm vật phẩm bí mật Easter Egg Album HVL - MCK vào bảng items để hỗ trợ bảng user_discoveries (FK)
INSERT INTO public.items (id, name, type, category, price, description, rarity) VALUES
('hvl_album', 'Đĩa Nhạc HVL - MCK', 'badge', 'easter_egg', 0, 'Đĩa nhạc bí mật chứa 30 bản phối huyền thoại HVL - MCK.', 'legendary')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, 
    description = EXCLUDED.description, 
    rarity = EXCLUDED.rarity;

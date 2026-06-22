-- 0051_item_season.sql
-- Đồ giới hạn theo MÙA LỄ: chỉ hiện trong /shop & mua được /buy khi đúng mùa (âm lịch).
-- season NULL = bán quanh năm (mặc định). Bot lọc qua src/lib/season.js (tháng âm lịch).
ALTER TABLE items ADD COLUMN IF NOT EXISTS season text;

UPDATE items SET season = 'tet'      WHERE id = 'banh_chung';       -- Tết: tháng Chạp + Giêng
UPDATE items SET season = 'trungthu' WHERE id = 'banh_trung_thu';   -- Trung thu: tháng 8 âm

-- Smoke: 2 đồ lễ đã gắn mùa, đồ thường vẫn NULL.
DO $$
BEGIN
    ASSERT (SELECT season FROM items WHERE id = 'banh_chung') = 'tet', 'banh_chung season sai';
    ASSERT (SELECT season FROM items WHERE id = 'banh_trung_thu') = 'trungthu', 'banh_trung_thu season sai';
    ASSERT (SELECT count(*) FROM items WHERE season IS NULL) > 0, 'phai con do quanh nam';
    RAISE NOTICE 'item_season smoke OK';
END $$;

-- ============================================================
-- 0067_item_category.sql — Thêm cột `category` phân loại đồ cho WIKI.
-- KHÔNG đổi `type` cũ (code lọc theo type/id/shop_hidden). Cột này CHỈ để phân loại hiển thị.
-- category: food_energy | food_health | buff | farm | material | craft | tool | insurance | vehicle | luxury | property | misc
-- Backfill an toàn (dựa type/effect + id pattern); catch-all 'misc' cho phần còn lại.
-- ============================================================
ALTER TABLE items ADD COLUMN IF NOT EXISTS category TEXT;

-- Nông sản/thu hoạch (trải nhiều type) — set TRƯỚC để không bị nhánh buff/food ghi đè.
UPDATE items SET category='farm'
  WHERE id ~ '^(trai|hoa|thit_heo)_' OR id IN ('ca_tuoi','cam_heo','phan_bon');
UPDATE items SET category='material'  WHERE id IN ('da','go','quang_sat');
UPDATE items SET category='craft'     WHERE id IN ('tam_go','thoi_sat','noi_that','trang_suc');
UPDATE items SET category='insurance' WHERE id IN ('bh_lao_dong','bh_duong_pho');
UPDATE items SET category='vehicle'   WHERE type='vehicle'  AND category IS NULL;
UPDATE items SET category='luxury'    WHERE type='luxury'   AND category IS NULL;
UPDATE items SET category='property'  WHERE type='property' AND category IS NULL;
UPDATE items SET category='buff'        WHERE type='consumable' AND effect_type='buff'   AND category IS NULL;
UPDATE items SET category='food_health' WHERE type='consumable' AND effect_type='health' AND category IS NULL;
UPDATE items SET category='food_energy' WHERE type='consumable' AND effect_type='energy' AND category IS NULL;
UPDATE items SET category='tool'        WHERE type='tool' AND category IS NULL;
UPDATE items SET category='misc'        WHERE category IS NULL;  -- catch-all (hop_but, ...)

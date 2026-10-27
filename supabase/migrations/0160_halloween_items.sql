-- ============================================================
-- 0160_halloween_items.sql — Hai vật phẩm MÙA HALLOWEEN.
--
-- Vì sao chỉ có DỮ LIỆU, không có DDL: ba cột cần dùng đã có sẵn —
--   `season`   (0051_item_season.sql)   · NULL = bán quanh năm
--   `rarity`   (0078_rarity_and_items)  · dùng cho /album
--   `category` (0067_item_category)     · dùng cho wiki/web
-- Nên đợt này KHÔNG đụng cấu trúc bảng; `schema-snapshot.json` không đổi.
--
-- MÙA LÀ DƯƠNG LỊCH, KHÁC HAI MÙA CŨ: `tet`/`trungthu` mở theo tháng ÂM lịch
-- (`src/lib/season.js`). Halloween là ngày dương 31/10 nên `season.js` được nới
-- thêm nhánh cửa sổ dương lịch — xem `test/halloween_mua_le.test.js`.
-- Không có nhánh đó thì hai món dưới đây KHÔNG BAO GIỜ hiện trong /store.
--
-- CÂN BẰNG — bậc thang buff theo lễ, xếp theo trọng lượng VĂN HOÁ VIỆT:
--   com_ga          2.000 xu · +20% · 1h   (hàng ngày)
--   banh_ma_gekka   6.000 xu · +25% · 3h   (Halloween — lễ du nhập)  <-- thêm ở đây
--   banh_trung_thu  8.000 xu · +30% · 4h   (Trung Thu)
--   banh_chung     16.000 xu · +40% · 8h   (Tết — lớn nhất)
-- Kẹo neo theo bậc đồ hồi năng lượng: ca_phe 500/60 · keo_bi_ngo 600/65 · soda 1.000/100.
--
-- KHÔNG IN TIỀN (Luật 10): cả hai đều KHÔNG nằm trong `BASE_MARKET_ITEMS`, nên đường bán
-- duy nhất là RPC `sell_item` = 50% giá mua -> mua rồi bán luôn lỗ một nửa. Chúng cũng
-- không phải nguyên liệu của công thức nào trong `src/data/recipes.js`.
-- Phép kiểm đó KHÔNG đặt được ở đây: bảng `market_prices` đã bị `0111_drop_dead_market_tables`
-- xoá, giá chợ nay SUY RA từ `items.price` qua RPC `market_unit_price`, còn danh sách món
-- chợ sống trong JS (`src/lib/market.js`). Nên nó nằm ở `test/halloween_mua_le.test.js`.
-- (Bản nháp của file này từng ASSERT trên `market_prices` — câu đó sẽ LÀM LỖI migration.)
--
-- IDEMPOTENT: ON CONFLICT (id) DO UPDATE -> chạy lại nhiều lần cho cùng kết quả, và
-- chạy trên DB đã có dòng thì CẬP NHẬT đúng về giá trị trong file này (khác 0043 dùng
-- DO NOTHING — ở đó mục tiêu là không đụng dữ liệu tạo tay, ở đây file này là nguồn).
-- ============================================================

INSERT INTO items (id, name, description, price, type, category, rarity, season, effect_type, effect_value, effect_duration_hours, shop_hidden) VALUES
  ('keo_bi_ngo',    'Kẹo Bí Ngô Halloween', 'Viên kẹo bí ngô Waguri giấu trong túi áo khoác. Hồi 65 năng lượng (/eat). Chỉ bán dịp Halloween.',   '600', 'consumable', 'food_energy', 'uncommon', 'halloween', 'energy', '65', '1', 'f'),
  ('banh_ma_gekka', 'Bánh Ma Gekka',        'Bánh quy hình ma do tiệm Gekka nướng riêng mùa Halloween. Tăng 25% thu nhập trong 3 giờ (/eat).', '6000', 'consumable', 'buff',        'uncommon', 'halloween', 'buff',   '25', '3', 'f')
ON CONFLICT (id) DO UPDATE SET
  name                  = EXCLUDED.name,
  description           = EXCLUDED.description,
  price                 = EXCLUDED.price,
  type                  = EXCLUDED.type,
  category              = EXCLUDED.category,
  rarity                = EXCLUDED.rarity,
  season                = EXCLUDED.season,
  effect_type           = EXCLUDED.effect_type,
  effect_value          = EXCLUDED.effect_value,
  effect_duration_hours = EXCLUDED.effect_duration_hours,
  shop_hidden           = EXCLUDED.shop_hidden;

-- Smoke: hai món có mặt, đúng mùa, đúng giá, và MUA ĐƯỢC ở tiệm (shop_hidden = false —
-- ẩn tiệm thì cả mùa lễ lẫn /store đều vô nghĩa).
DO $$
BEGIN
    ASSERT (SELECT season      FROM items WHERE id = 'keo_bi_ngo')    = 'halloween', 'keo_bi_ngo sai mua';
    ASSERT (SELECT season      FROM items WHERE id = 'banh_ma_gekka') = 'halloween', 'banh_ma_gekka sai mua';
    ASSERT (SELECT price       FROM items WHERE id = 'banh_ma_gekka') = 6000,        'banh_ma_gekka sai gia';
    ASSERT (SELECT price       FROM items WHERE id = 'keo_bi_ngo')    = 600,         'keo_bi_ngo sai gia';
    ASSERT (SELECT shop_hidden FROM items WHERE id = 'keo_bi_ngo')    = false,       'keo_bi_ngo bi an khoi tiem';
    ASSERT (SELECT shop_hidden FROM items WHERE id = 'banh_ma_gekka') = false,       'banh_ma_gekka bi an khoi tiem';

    RAISE NOTICE 'halloween_items smoke OK';
END $$;

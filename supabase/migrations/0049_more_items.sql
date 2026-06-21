-- ============================================================
-- 0049_more_items.sql — Đa dạng vật phẩm: đặc sản vùng miền + đồ mùa lễ.
-- Đồ tiêu thụ generic (effect_type/value) -> tự hoạt động trong /eat /shop /buy /sell.
-- Giá khớp đường cong kinh tế hiện có (~6-12đ/năng lượng; buff theo % & giờ).
-- ON CONFLICT DO NOTHING -> an toàn DB live.
-- ============================================================
INSERT INTO items (id,name,description,price,type,effect_type,effect_value,effect_duration_hours,shop_hidden) VALUES
  -- Đặc sản vùng miền (hồi năng lượng)
  ('che_ba_mau','Chè Ba Màu','Ly chè ba màu mát lạnh ngọt dịu — món vặt yêu thích của Waguri.','150','consumable','energy','20','1','f'),
  ('banh_cuon','Bánh Cuốn Thanh Trì','Bánh cuốn mỏng mềm chấm nước mắm thơm.','250','consumable','energy','30','1','f'),
  ('tra_sua','Trà Sữa Trân Châu','Trà sữa trân châu đường đen béo ngậy.','300','consumable','energy','35','1','f'),
  ('goi_cuon','Gỏi Cuốn Tôm Thịt','Gỏi cuốn tươi mát, chấm tương đậm đà.','320','consumable','energy','35','1','f'),
  ('banh_xeo','Bánh Xèo Miền Tây','Bánh xèo giòn rụm cuốn rau sống đặc trưng miền Tây.','400','consumable','energy','45','1','f'),
  ('mi_quang','Mì Quảng Đà Nẵng','Tô mì Quảng đậm đà hương vị xứ Quảng.','420','consumable','energy','45','1','f'),
  ('pho','Phở Hà Nội','Tô phở nóng hổi nước dùng ngọt thanh — quốc hồn quốc túy.','450','consumable','energy','50','1','f'),
  ('com_tam','Cơm Tấm Sài Gòn','Cơm tấm sườn bì chả chuẩn vị Sài Gòn.','450','consumable','energy','50','1','f'),
  ('bun_bo','Bún Bò Huế','Tô bún bò Huế cay nồng đậm đà xứ Huế.','500','consumable','energy','55','1','f'),
  -- Hồi sức khỏe
  ('nuoc_chanh','Nước Chanh Mật Ong','Ly nước chanh mật ong ấm, dịu cổ họng. Hồi 25 sức khỏe.','300','consumable','health','25','1','f'),
  ('chao_ga','Cháo Gà Giải Cảm','Bát cháo gà nóng giải cảm. Hồi 35 sức khỏe.','450','consumable','health','35','1','f'),
  -- Buff thu nhập
  ('ca_phe_trung','Cà Phê Trứng Hà Nội','Cà phê trứng béo thơm trứ danh Hà Nội. +15% thu nhập trong 2 giờ.','1800','consumable','buff','15','2','f'),
  -- Đồ mùa lễ (mô tả theo mùa; mua được quanh năm)
  ('banh_trung_thu','Bánh Trung Thu Thập Cẩm','Bánh trung thu thập cẩm đậm vị Tết Trung Thu. +30% thu nhập trong 4 giờ.','8000','consumable','buff','30','4','f'),
  ('banh_chung','Bánh Chưng Xanh Tết','Bánh chưng xanh gói lá dong — hương vị Tết cổ truyền. +40% thu nhập trong 8 giờ.','16000','consumable','buff','40','8','f')
ON CONFLICT (id) DO NOTHING;

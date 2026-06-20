-- ============================================================
-- 0043_seed_catalog.sql — SEED danh mục GỐC (items + jobs)
-- ------------------------------------------------------------
-- Lý do tồn tại: các item/nghề nền vốn được tạo TAY trên Supabase trước khi có
-- version control (xem ghi chú 0001_schema.sql) -> KHÔNG có file nào tái tạo được.
-- File này dump lại trạng thái hiện tại để repo TÁI TẠO ĐẦY ĐỦ khi dựng DB mới.
--
-- AN TOÀN với DB đang chạy: ON CONFLICT (id) DO NOTHING -> gặp dòng đã có thì BỎ QUA,
-- không ghi đè. Chạy trên DB live = no-op. Chạy trên DB trống = nạp đầy đủ.
-- Thứ tự: items TRƯỚC, jobs SAU (jobs.required_item_id tham chiếu items.id).
-- ============================================================

INSERT INTO items (id,name,description,price,type,effect_type,effect_value,effect_duration_hours,shop_hidden) VALUES
  ('banh_mi','Bánh Mì Việt Nam','Sự kết hợp hoàn hảo giữa vỏ giòn Việt Nam và nhân ngọt ngào Waguri yêu thích.','150','consumable','energy','25','1','f'),
  ('thuoc_cam_cum','Thuốc Cảm Cúm','Hồi phục 20 điểm sức khỏe khi sử dụng (/eat).','150','consumable','health','20','1','f'),
  ('xoi','Xôi Xéo Hà Nội','Món xôi xéo dẻo thơm truyền thống Việt Nam khiến cô gái Kikyo trầm trồ.','250','consumable','energy','40','1','f'),
  ('ca_phe','Cà Phê Sữa Đá','Cà phê sữa đá đậm đà Việt Nam giúp Waguri tỉnh táo ôn thi.','500','consumable','energy','60','1','f'),
  ('hop_y_te','Hộp Y Tế Kikyo','Hộp sơ cứu tiêu chuẩn của học sinh Kikyo. Hồi 50 sức khỏe.','500','consumable','health','50','1','f'),
  ('nuoc_tang_luc','Soda Trái Cây Gekka','Nước soda trái cây mát lạnh tại tiệm bánh Gekka. Hồi 100 năng lượng.','1000','consumable','energy','100','1','f'),
  ('com_ga','Cơm Gà Việt','Cơm gà thơm nức mũi giúp Rintaro và Waguri nạp đầy năng lượng sau giờ học.','2000','consumable','buff','20','1','f'),
  ('ve_vip','Bánh Kem Dâu Gekka','Chiếc bánh kem dâu đặc trưng của tiệm Gekka do chính tay Rintaro làm.','20000','consumable','buff','50','6','f'),
  ('ve_dai_gia','Bánh Cheesecake Gekka','Bánh cheesecake nướng thơm ngon hảo hạng của tiệm Gekka.','35000','consumable','buff','100','8','f'),
  ('dong_ho_saku','Đồng Hồ Của Saku','Đồng hồ đeo tay nghiêm chỉnh của Saku Natsui.','200000','luxury','none','0','1','f'),
  ('tui_hermes','Túi Hiệu Học Sinh Kikyo','Chiếc cặp da đắt tiền phong cách học sinh quý tộc Kikyo.','350000','luxury','none','0','1','f'),
  ('sieu_xe','Siêu xe Mazda Miata MX-5','Chiếc xe mui trần màu đỏ thể thao mà cả nhóm Chidori mơ ước.','5000000','luxury','none','0','1','f'),
  ('du_thuyen','Du Thuyền Học Viện','Du thuyền sang chảnh được dùng trong kỳ nghỉ hè của học viện Kikyo.','10000000','luxury','none','0','1','f'),
  ('da','Đá',NULL,'40','material','none','0','1','f'),
  ('go','Gỗ',NULL,'60','material','none','0','1','f'),
  ('quang_sat','Quặng Sắt',NULL,'100','material','none','0','1','f'),
  ('tam_go','Tấm Gỗ',NULL,'250','misc','none','0','1','f'),
  ('thoi_sat','Thỏi Sắt',NULL,'400','misc','none','0','1','f'),
  ('hop_but','Hộp Bút Hoa Anh Đào','Hộp bút xinh xắn dán đầy sticker hoa anh đào.','500','misc','none','0','1','f'),
  ('noi_that','Bộ Nội Thất Gỗ',NULL,'5000','misc','none','0','1','f'),
  ('trang_suc','Trang Sức Đá Quý',NULL,'6000','misc','none','0','1','f'),
  ('can_ho','Căn Hộ Chung Cư','An cư lạc nghiệp.','400000','property','none','0','1','f'),
  ('biet_thu','Biệt Thự Kikyo','Biệt thự cổ kính sang trọng mang phong cách Kikyo.','3000000','property','none','0','1','f'),
  ('the_sinh_vien','Thẻ Học Sinh Kikyo','Thẻ học sinh của Học viện Nữ sinh Kikyo danh giá.','500','tool','none','0','1','f'),
  ('mu_noi','Mũ Nồi Kikyo','Mũ nồi đồng phục thanh lịch của học sinh Kikyo.','800','tool','none','0','1','f'),
  ('bh_lao_dong','Bảo Hiểm Tiệm Gekka','Bảo hiểm bảo vệ cậu trước tai nạn lao động tại tiệm bánh.','1000','tool','none','0','1','f'),
  ('can_cau','Cần Câu Cá','Dùng để câu cá kiếm tiền (/fish). Độ bền 100.','1000','tool','none','0','1','f'),
  ('cuoc_sat','Cuốc Sắt','Dùng để đào mỏ kiếm tiền (/mine). Độ bền 100.','1500','tool','none','0','1','f'),
  ('riu_sat','Rìu Sắt','Dùng để chặt gỗ kiếm tiền (/chop). Độ bền 100.','1500','tool','none','0','1','f'),
  ('bh_duong_pho','Bảo Hiểm Học Đường','Bảo hiểm của Kikyo giúp giảm 50% thời gian kỷ luật/tạm giam.','2000','tool','none','0','1','f'),
  ('bo_do_sua_xe','Bộ Dụng Cụ Làm Bánh Gekka','Bộ phới, khuôn, lò nướng mini để tự tay làm bánh ngọt.','8000','tool','none','0','1','f'),
  ('laptop','Laptop Soạn Bài','Laptop học tập và nghiên cứu công thức làm bánh mới.','25000','tool','none','0','1','f'),
  ('may_quay','Máy Ảnh Của Subaru','Máy ảnh xịn sò để Subaru chụp hình kỷ niệm cùng mọi người.','30000','tool','none','0','1','f'),
  ('ban_phim_co','Bàn Phím Cơ Hoa Anh Đào','Bàn phím cơ thiết kế màu hồng đào gõ cực êm.','40000','tool','none','0','1','f'),
  ('xe_dap','Xe Đạp Mini Nhật Bản','Xe đạp giỏ hoa xinh xắn để đi học hàng ngày.','800','vehicle','none','0','1','f'),
  ('xe_wave','Xe Honda Wave','Chiếc xe Wave huyền thoại của Việt Nam được Waguri dán decal hoa anh đào.','3000','vehicle','none','0','1','f'),
  ('xe_sh','Xe Vespa Hồng Cute','Xe tay ga Vespa màu hồng pastel cực xinh xắn.','15000','vehicle','none','0','1','f'),
  ('o_to_vinfast','Ô tô VinFast VF3','Xe điện mini Việt Nam cực kỳ hợp để vi vu ngắm hoa anh đào.','50000','vehicle','none','0','1','f'),
  ('sh','Xe Honda SH Mode','Xe tay ga SH Mode sang chảnh, đi êm và tiết kiệm sức.','80000','vehicle','none','0','1','f'),
  ('o_to_cu','Ô Tô Cũ Của Rintaro','Chiếc xe cũ nát Rintaro dùng để đi lại.','150000','vehicle','none','0','1','f'),
  ('mercedes','Xe Rolls-Royce Kikyo','Xe đưa đón sang trọng của học viện nữ sinh Kikyo.','500000','vehicle','none','0','1','f'),
  ('trai_1500','Trái Cây Loại Thường','Trái cây vườn nhà. /eat hồi năng lượng hoặc /sell.','3000','consumable','energy','30','1','t'),
  ('thit_heo_2000','Thịt Heo Loại Thường','Thịt heo nuôi nhà. /eat hồi năng lượng hoặc /sell lấy tiền.','4000','consumable','energy','40','1','t'),
  ('trai_2000','Trái Cây Loại Khá','Trái cây tươi ngon. /eat hồi năng lượng hoặc /sell.','4000','consumable','energy','40','1','t'),
  ('thit_heo_2500','Thịt Heo Loại Khá','Thịt heo chắc thịt. /eat hồi năng lượng hoặc /sell.','5000','consumable','energy','60','1','t'),
  ('trai_2500','Trái Cây Loại Ngon','Trái cây mọng nước. /eat hồi năng lượng hoặc /sell.','5000','consumable','energy','60','1','t'),
  ('thit_heo_3000','Thịt Heo Loại Ngon','Thịt heo thơm ngon. /eat hồi năng lượng hoặc /sell.','6000','consumable','energy','80','1','t'),
  ('trai_3000','Trái Cây Loại Tuyển','Trái cây tuyển chọn. /eat hồi năng lượng hoặc /sell.','6000','consumable','energy','80','1','t'),
  ('thit_heo_3500','Thịt Heo Loại Tuyển','Thịt heo tuyển chọn. /eat hồi đầy năng lượng hoặc /sell.','7000','consumable','energy','100','1','t'),
  ('trai_3500','Trái Cây Hảo Hạng','Trái cây hảo hạng. /eat hồi đầy năng lượng hoặc /sell.','7000','consumable','energy','100','1','t'),
  ('thit_heo_4000','Thịt Heo Bạch Tạng','Thịt heo bạch tạng quý hiếm. /eat nhận buff thu nhập hoặc /sell.','8000','consumable','buff','20','2','t'),
  ('thit_heo_holo','Thịt Heo Hologram','Thịt heo huyền thoại lấp lánh! /eat buff lớn hoặc /sell giá khủng.','100000','consumable','buff','100','6','t'),
  ('cam_heo','Cám Heo','Thức ăn cho heo (nhận khi thu hoạch cây). Cho heo ăn lần 2 đỡ tốn tiền.','200','misc','none','0','1','t'),
  ('phan_bon','Phân Bón','Phân bón hữu cơ (nhận khi nuôi heo). Bón cây miễn phí.','200','misc','none','0','1','t'),
  ('hoa_1500','Hoa Loại Thường','Một đoá hoa xinh. Có thể /sell.','3000','misc','none','0','1','t'),
  ('hoa_2000','Hoa Loại Khá','Bó hoa tươi tắn. Có thể /sell.','4000','misc','none','0','1','t'),
  ('hoa_2500','Hoa Loại Đẹp','Bó hoa rực rỡ. Có thể /sell.','5000','misc','none','0','1','t'),
  ('hoa_3000','Hoa Loại Quý','Bó hoa quý phái. Có thể /sell.','6000','misc','none','0','1','t'),
  ('hoa_3500','Hoa Hảo Hạng','Bó hoa thượng hạng. Có thể /sell.','7000','misc','none','0','1','t'),
  ('do_trom','Đồ Nghề Trộm','Bộ đồ nghề chế từ gỗ & sắt — đi trộm khỏi tốn tiền mua đồ.','400','tool','none','0','1','t')
ON CONFLICT (id) DO NOTHING;

INSERT INTO jobs (id,name,required_level,min_wage,max_wage,required_item_id,risk_rate) VALUES
  ('ban_tra_da','Bán trà đá Hồ Tây','1','50','200',NULL,'0.1'),
  ('nhat_ve_chai','Dọn dẹp hành lang Kikyo','1','30','120',NULL,'0.05'),
  ('phu_ho','Phụ việc tiệm bánh Gekka','2','100','300',NULL,'0.15'),
  ('shipper','Giao bánh ngọt Gekka','3','150','400','xe_dap','0.15'),
  ('sinh_vien','Học sinh làm thêm','3','150','400','the_sinh_vien','0.2'),
  ('nong_dan','Nông dân nông trại','5','320','850',NULL,'0.1'),
  ('tho_sua_xe','Thợ nướng bánh Gekka','5','350','900','bo_do_sua_xe','0.1'),
  ('xe_om','Xe ôm công nghệ','5','300','800','xe_wave','0.15'),
  ('moi_gioi','Quản lý tiệm bánh Gekka','10','800','3000','laptop','0.2'),
  ('streamer','Trưởng ban kỷ luật Kikyo','10','700','2500','may_quay','0.25'),
  ('dev','Chuyên viên trang trí bánh','15','1500','5000','ban_phim_co','0.05'),
  ('chu_tich','Tổng quản lý Gekka','30','5000','20000','mercedes','0.2'),
  ('dai_gia','Chủ chuỗi tiệm bánh Gekka','40','20000','60000','biet_thu','0.15')
ON CONFLICT (id) DO NOTHING;

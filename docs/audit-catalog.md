# Audit Catalog Vật Phẩm (nguồn: DB live `discord-waguri`, 74 item)

> Mục đích: chuẩn bị cho **wiki phân loại đồ** + mở rộng đa dạng. Audit theo DB thật (không phải file seed).
> ⚠️ Nguyên tắc an toàn: **KHÔNG đổi `id` item trên DB live** — `inventory` & code tham chiếu id, đổi = orphan/hỏng.

---

## A. Phân loại lại cho WIKI (74 item)

`type` hiện có 7 giá trị nhưng **không map sạch** cho wiki (đặc biệt `misc` là ngăn tạp). Đề xuất **nhóm wiki**:

| # | Nhóm wiki | Item | Ghi chú |
|---|---|---|---|
| 🍜 | Đồ ăn hồi **năng lượng** | che_ba_mau, banh_mi, xoi, banh_cuon, tra_sua, goi_cuon, banh_xeo, mi_quang, com_tam, pho, bun_bo, ca_phe, nuoc_tang_luc | 13 món — phong phú, chất Việt ✅ |
| 💊 | Hồi **sức khỏe** | thuoc_cam_cum, nuoc_chanh, chao_ga, hop_y_te | 4 |
| ✨ | **Buff** thu nhập | ca_phe_trung, com_ga, banh_trung_thu, banh_chung, ve_vip, ve_dai_gia | 6 (+ thịt heo buff) |
| 🌾 | **Nông sản/thu hoạch** | trai_1500..3500, hoa_1500..3500, thit_heo_2000..holo, ca_tuoi, cam_heo, phan_bon | ⚠️ **rải 3 type khác nhau** (xem C) |
| ⛏️ | **Nguyên liệu & chế tạo** | da, go, quang_sat · tam_go, thoi_sat · noi_that, trang_suc | craftable noi_that/trang_suc giờ dùng nâng cấp tiệm ✅ |
| 🧰 | **Công cụ** | can_cau, cuoc_sat, riu_sat, bo_do_sua_xe, do_trom · the_sinh_vien, mu_noi, hop_but, laptop, may_quay, ban_phim_co | tool khai thác + tool gate-nghề |
| 🛡️ | **Bảo hiểm** | bh_lao_dong, bh_duong_pho | ⚠️ đang type='tool' |
| 🚗 | **Phương tiện** | xe_dap, xe_wave, xe_sh, o_to_vinfast, sh, o_to_cu, mercedes | 7 xe |
| 💎 | **Xa xỉ & Bất động sản** | dong_ho_saku, tui_hermes, sieu_xe, du_thuyen, can_ho, biet_thu | flex/networth (biet_thu còn gate nghề dai_gia) |

---

## B. 🔴 ID ↔ TÊN LỆCH NGHĨA (phần "lọc tên id" bạn yêu cầu)

Di sản từ các lần đổi tên (id giữ nguyên, tên đổi) → **id gây hiểu nhầm cho dev/wiki**:

| id (nghĩa đen) | name thật | Mức |
|---|---|---|
| `bo_do_sua_xe` (bộ đồ **sửa xe**) | **Bộ Dụng Cụ Làm Bánh** Gekka | 🔴 lệch hẳn |
| `ve_vip` / `ve_dai_gia` (**vé** VIP/đại gia) | **Bánh Kem Dâu / Cheesecake** Gekka | 🔴 lệch hẳn |
| `bh_duong_pho` (**đường phố**) | Bảo Hiểm **Học Đường** | 🔴 street≠school |
| `sh` vs `xe_sh` | Honda SH (80k) vs **Vespa** (15k) | ⚠️ 2 id gần trùng, 2 xe KHÁC → dễ nhầm |
| `nuoc_tang_luc` | **Soda Trái Cây** Gekka | ⚠️ nhẹ |
| `may_quay` (máy **quay**) | **Máy Ảnh** Của Subaru | ⚠️ nhẹ |

**Khuyến nghị (quan trọng):** **KHÔNG rename id trên DB live** (sẽ orphan inventory + hỏng code/config tham chiếu). Thay vào đó:
1. (rẻ, an toàn) Chấp nhận id di sản — chỉ cần **1 bảng mapping id→nghĩa** trong wiki/docs để dev khỏi nhầm.
2. NEW item: **dùng id sạch, khớp tên** ngay từ đầu.
3. Nếu THỰC SỰ muốn đổi id: phải làm migration cẩn thận (đổi id + UPDATE inventory.item_id + sửa mọi ref code/config) — rủi ro cao, chỉ khi cần.

---

## C. ⚠️ TYPE/CATEGORY KHÔNG NHẤT QUÁN (chí mạng cho wiki phân loại)

- **Nông sản rải 3 type:** trái=`consumable`, hoa=`misc`, cá=`material`, thịt=`consumable` → wiki không nhóm được "đồ farm" bằng `type`.
- **Bảo hiểm = `tool`** (nên là nhóm riêng).
- **`misc` là ngăn tạp:** trộn chế-phẩm (tam_go, thoi_sat), craftable (noi_that, trang_suc), nông sản (hoa_*), phụ phẩm (cam_heo, phan_bon), trang trí (hop_but).

**Khuyến nghị an toàn:** **THÊM cột `category`** (text) cho phân loại wiki — **KHÔNG đổi `type` cũ** (code lọc theo type: shop `shop_hidden`, config VEHICLES theo id…). Cột `category` mới = nguồn cho wiki, không ảnh hưởng gameplay. Vd: `food_energy, food_health, buff, farm, material, craft, tool, insurance, vehicle, luxury, cosmetic, gift, bakery`.

---

## D. Orphan / usage
- **"Never held" nhiều nhưng player base nhỏ → tín hiệu yếu**, KHÔNG kết luận item chết.
- Vòng hở đã đóng bớt: `noi_that/trang_suc` → nâng cấp tiệm ✅ · `hoa_*/trai_*/thit_heo_*/ca_tuoi` → filling tiệm ✅.
- `hop_but` (Hộp Bút): chỉ bán, chưa dùng gì → thuần flex/decor.
- Không phát hiện tên trùng lặp (DUP_NAME = 0) ✅.

---

## E. GAPS & ĐỀ XUẤT MỞ RỘNG (đa dạng, phong phú hơn)

| Nhóm | Thiếu | Đề xuất thêm (id sạch) |
|---|---|---|
| ✨ Buff | Nhảy bậc 2000→8000→16000 (thiếu 3000–7000) | `banh_su_kem` (3500, buff+25%/3h), `banh_flan` (5000, +30%/4h) |
| 🎣 Cá | Chỉ 1 tier `ca_tuoi` | `ca_ngon`, `ca_hiem` (tier cao) — rơi khi câu cá lớn, filling tiệm xịn |
| 🎁 Quà tặng | Chưa có item tặng Waguri/người khác | `bo_hoa` (bó hoa), `hop_qua`, `gau_bong` → +thiện cảm/love |
| 🐾 Pet | Chưa có đồ pet | `thuc_an_pet`, `vong_co_pet` (buff pet) |
| 🎀 Cosmetic item | Cosmetic chỉ title/màu | `huy_hieu_*`, `pin_hoa_anh_dao` (flex, hiện /profile) |
| 🍰 Bakery P2 | Chưa có nhân viên/trang trí item | `ban_ghe_go`, `den_trang_tri`, `bien_hieu` (trang trí tiệm) |
| 🎋 Seasonal | Chỉ 2 (chưng/trung thu) | Tết: `mut_tet`, `dua_hanh`; Trung Thu: `den_long`; Halloween/Noel |

**Lưu ý cân bằng khi thêm:** mỗi item mới cần (a) **nguồn lấy rõ** (shop/drop/craft/farm), (b) **công dụng** (đừng chỉ để bán → clutter), (c) giá khớp thang hiện có, (d) thêm vào `category` cho wiki.

---

## F. Việc nên làm (thứ tự)
1. **Thêm cột `category`** + backfill 74 item (migration 0067) → wiki phân loại được ngay, an toàn.
2. **Bảng mapping id di sản** trong wiki/docs (bo_do_sua_xe, ve_vip… → nghĩa thật).
3. **Mở rộng item theo §E** — từng nhóm, kèm nguồn + công dụng (đừng thêm clutter).
4. (tuỳ chọn, rủi ro cao) Nếu muốn id sạch: migration đổi id + UPDATE inventory — chỉ khi thật cần.

# Roadmap Mở Rộng Waguri — Backlog cần thiết kế chi tiết

> Tổng hợp mọi hạng mục mở rộng tích lũy qua các phiên. Mỗi task ghi: **cần thiết kế gì · phụ thuộc · ưu tiên**.
> Ưu tiên: 🔴 gấp/nền tảng · 🟠 giá trị cao · 🟢 nice-to-have. Trạng thái: ✅ xong · 🔨 đang · ⬜ chưa.

## 0. Đã xong phiên này (tham chiếu)
- ✅ Hệ quest random + ghim daily/vote · ✅ vá tiền (achievements/vay/clan/lixi) · ✅ đổi tên & gộp lệnh (/nghingoi /trongcay /vay /bank)
- ✅ **Tiệm Bánh Gekka Phase 1** (đã áp DB prod, RPC verified) · ✅ audit catalog + cột `category` · ✅ đổi 7 id item lệch nghĩa
- ⏳ **CHỜ DEPLOY:** code bakery + rename ở nhánh `feat/bakery-phase1` — cần **push→master→pull server→restart** thì mới chơi được `/tiembanh` và alias mới.

---

## 1. 🍰 Tiệm Bánh Gekka — Phase 2 & 3
| Task | Cần thiết kế chi tiết | Ưu tiên | Phụ thuộc |
|---|---|---|---|
| **Nhân viên NPC** | Bảng/jsonb staff, RPC hire/fire, công thức bonus (Rintaro +15% rev, Subaru +cap, Usami +rate) + lương %; UI `/tiembanh thue` | 🟠 | P1 |
| **Trang trí tiệm** | Danh mục decor (tái dùng `noi_that` + item mới), bonus "khách hài lòng", hiển thị /profile | 🟠 | P1 |
| **Sự kiện Waguri quản lý** | Nối `eventCalendar`/`season`: x2 doanh thu, mẻ đặc biệt; bánh mùa lễ (Tết/Trung Thu) | 🟢 | P1 |
| **BXH tiệm + trang web /tiem/[id]** | RPC `bakery_leaderboard`, API voteServer, trang Next.js khoe tiệm | 🟢 | P1 |
| **Tích hợp AI** | Đưa trạng thái tiệm vào context persona (nối "trí nhớ Waguri") | 🟢 | Memory |

## 2. 🎒 Mở rộng Catalog item (theo `docs/audit-catalog.md §E`)
| Nhóm | Item đề xuất | Cần thiết kế: **nguồn lấy + công dụng + giá** | Ưu tiên |
|---|---|---|---|
| ✨ Buff tầm trung | `banh_su_kem`, `banh_flan` | lấp khoảng 3.000–7.000 (đang nhảy bậc) | 🟠 |
| 🎣 Cá nhiều tier | `ca_ngon`, `ca_hiem` | rơi khi câu cá lớn → filling tiệm xịn + đa dạng | 🟠 |
| 🎁 Quà tặng | `bo_hoa`, `hop_qua`, `gau_bong` | tặng người khác/Waguri → +thiện cảm/love (nối bakery cake) | 🟠 |
| 🐾 Pet items | `thuc_an_pet`, `vong_co_pet` | nối pet vào farm output (nuôi bằng thịt/cá thay tiền) | 🟢 |
| 🎀 Cosmetic item | `huy_hieu_*`, `pin_hoa_anh_dao` | flex, hiện /profile (khác title/màu hiện có) | 🟢 |
| 🎋 Seasonal | `mut_tet`, `dua_hanh`, `den_long`… | mở rộng Tết/Trung Thu/Noel | 🟢 |
> ⚠️ Nguyên tắc: mỗi item mới PHẢI có nguồn + công dụng rõ, tránh clutter. Thêm vào `category` cho wiki.

## 3. ❤️ Giữ chân & Onboarding
| Task | Cần thiết kế | Ưu tiên |
|---|---|---|
| **Welcome member per-server** | `/config welcome-channel` + `welcome-role`; guildMemberAdd đọc guild setting thay hardcode support | 🟠 |
| **Newbie quest chain** | Chuỗi 1-lần 5 bước (daily→work×3→mua món→xin nghề→chơi game), thưởng dồn; tận dụng hệ quest | 🟠 |
| **Cứu trợ phá sản + streak freeze** | wallet+bank=0 → trợ cấp nhỏ; nới grace streak (đã có 48h) | 🟢 |
| **Season ladder / prestige** | Mục tiêu dài hạn sau max level | 🟢 |

## 4. 🔧 Hardening & lỗi tồn (từ review per-command)
| Task | Vị trí | Ưu tiên |
|---|---|---|
| **Harden /confession** | cooldown + audit trail + chặn @mention (chống quấy rối ẩn danh) | 🟠 |
| /buy bỏ qua `shop_hidden` (mua đồ ẩn bằng id) | `buy.js` | 🟠 |
| fetch không timeout (treo interaction) | cat/dog/waifu/thoitiet | 🟢 |
| /tangdo tặng cả tool/xe (mô tả chỉ hoa/đồ ăn) | `tangdo.js` | 🟢 |
| bingo/loto lobby bỏ hoang khóa tiền tới restart | `bingoPrefix/loto` | 🟢 |
| cosmetic/pet/nghingoi trừ-tiền-trước-thao-tác-sau (gộp RPC atomic) | 3 lệnh | 🟢 |

## 5. 🧹 Chất lượng & Nợ kỹ thuật
| Task | Cần thiết kế | Ưu tiên |
|---|---|---|
| **Integration test luồng tiền** | Test RPC trên Supabase test env (gap lớn nhất — 0 lưới an toàn runtime cho tiền) | 🔴 |
| **`lib/messages.js`** | Gom chuỗi lỗi lặp + `formatCooldown` (chuẩn hóa `<t:R>` vs "Ns") + giọng persona (mình/tớ, /ask embed) | 🟠 |
| **Paginate embed dài** | `/jobs`, `/vay so` (chống tràn 1024/4096 + mobile) | 🟠 |
| **Telemetry kinh tế** | Log tổng cung tiền/ngày, top earner → tune cân bằng (đặc biệt sau khi thêm bakery faucet) | 🟠 |
| **Cap affection/ngày** | Chống farm "Tri kỷ" (RPC add_affection hiện cộng vô điều kiện) | 🟢 |
| Đổi id item còn lại (nếu muốn) | Nay chỉ NEW item dùng id sạch; legacy đã map | 🟢 |

## 6. 🏛️ Chiến lược lớn (đầu tư cao, cần thiết kế sâu riêng)
| Task | Mô tả | Ưu tiên |
|---|---|---|
| **⭐ Trí nhớ bền Waguri** | Lưu vài "mẩu ký ức"/người trong DB → cô nhớ & phản ứng theo hành trình. Moat cảm xúc. | 🔴-chiến lược |
| **Battle Pass theo mùa** | Vé mùa free+premium track gắn lễ hội VN → retention + doanh thu | 🟠 |
| **Đường tình cảm Waguri** (dating-sim nhẹ) | Affection mở khóa hội thoại/cảnh/quà; gate 1 phần Premium | 🟠 |
| **Bộ sưu tập (album)** | Pokédex cá/quặng/công thức, thưởng hoàn thành | 🟢 |
| **World event mỗi ngày** | Cả server chung mục tiêu → thưởng chung | 🟢 |
| **Clan nâng cao** | Giải đấu, quest bang, BXH tuần | 🟢 |
| **Referral + tặng Premium** | Đòn bẩy tăng trưởng (roadmap B.5) | 🟢 |
| **GIF pool** | Giãn/khử trùng + job auto-fetch Tenor | 🟢 |
| **Pet evolution / skill tree** | Chiều sâu progression | 🟢 |

---

## Thứ tự đề xuất (nếu hỏi tôi)
1. **Deploy** bakery P1 (push) + **QA runtime** trên server.
2. 🔴 **Integration test luồng tiền** (nền tảng an toàn cho mọi thay đổi tiền sau này).
3. 🟠 **Bakery P2** (nhân viên/trang trí) + **mở rộng catalog** nhóm buff/cá/quà (nối bakery↔affection).
4. 🟠 **Harden /confession** + **welcome per-server & newbie chain** (giữ chân).
5. 🔴-chiến lược **Trí nhớ Waguri** khi sẵn sàng đầu tư lớn (moat).

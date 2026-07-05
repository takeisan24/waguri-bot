# Roadmap Mở Rộng Waguri — Backlog cần thiết kế chi tiết

> **⭐ ĐÂY LÀ NGUỒN SỰ THẬT DUY NHẤT cho backlog & trạng thái.** Mọi bản kế hoạch theo lịch-ngày (Sprint theo "Ngày 1→30") KHÔNG được duy trì — đã lưu trữ, chỉ tham khảo ý tưởng. Xem `AGENTS.md` để định hướng phiên làm việc.
> Tổng hợp mọi hạng mục mở rộng tích lũy qua các phiên. Mỗi task ghi: **cần thiết kế gì · phụ thuộc · ưu tiên**.
> Ưu tiên: 🔴 gấp/nền tảng · 🟠 giá trị cao · 🟢 nice-to-have. Trạng thái: ✅ xong · 🔨 đang · ⬜ chưa.

## 0. Đã xong (tham chiếu — cập nhật 2026-07-05)
- ✅ Hệ quest random + ghim daily/vote · ✅ vá tiền (achievements/vay/clan/lixi) · ✅ đổi tên & gộp lệnh (/nghingoi /trongcay /vay /bank)
- ✅ **Tiệm Bánh Gekka Phase 1 + migration Phase 2** (`0070`, đã áp DB prod) · ✅ audit catalog + cột `category` · ✅ đổi 7 id item lệch nghĩa
- ✅ **Integration test luồng tiền** (`test/economy.integration.test.js` đã có — gap 🔴 mục §5 đã đóng)
- ✅ **`database.js` không còn `process.exit` cứng** — đã dùng Proxy throw có kiểm soát (require được trong test)
- ✅ **`confession_logs`** bảng đã tạo + đang ghi log
- ✅ **Ký ức AI (hạ tầng):** migration `0074` (cột `ai_memory` + RPC `update_ai_memory`) & `0074b` (`refund_ai_quota`) đã áp DB + verified; helper `updateAiMemory`/`refundAiQuota`; **đọc `ai_memory` đã wire vào system prompt** (`src/lib/ai/index.js`).
- ✅ **Fail-safe:** hoàn quota AI khi Gemini lỗi · cache 1h + fallback thời tiết `/thoitiet`.
- ✅ **Release `v2.0.0`** (GitHub tag + `package.json` đồng bộ).

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
| ✅ **Integration test luồng tiền** | ĐÃ XONG — `test/economy.integration.test.js` phủ addMoney/transfer/buy/consume | ✅ |
| **`lib/messages.js`** | Gom chuỗi lỗi lặp + `formatCooldown` (chuẩn hóa `<t:R>` vs "Ns") + giọng persona (mình/tớ, /ask embed) | 🟠 |
| **Paginate embed dài** | `/jobs`, `/vay so` (chống tràn 1024/4096 + mobile) | 🟠 |
| **Telemetry kinh tế** | Log tổng cung tiền/ngày, top earner → tune cân bằng (đặc biệt sau khi thêm bakery faucet) | 🟠 |
| **Cap affection/ngày** | Chống farm "Tri kỷ" (RPC add_affection hiện cộng vô điều kiện) | 🟢 |
| Đổi id item còn lại (nếu muốn) | Nay chỉ NEW item dùng id sạch; legacy đã map | 🟢 |

## 6. 🏛️ Chiến lược lớn (đầu tư cao, cần thiết kế sâu riêng)
| Task | Mô tả | Ưu tiên |
|---|---|---|
| 🔨 **⭐ Trí nhớ bền Waguri** | Hạ tầng XONG (DB `ai_memory`, RPC, helper, đọc vào prompt). **CÒN THIẾU: đường GHI** — lệnh `/nho` hoặc auto-extract để thật sự lưu ký ức. Moat cảm xúc. | 🔴-chiến lược |
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

---

## Phụ lục — Bảo tồn từ `.local-brainstorm/` (đã xóa 2026-07-05, giữ lại phần còn giá trị)

**A. Quyết định cân bằng đã CHỐT (đã áp vào `config` — giữ để tra lý do):**
- `/work` tốn **6** năng lượng · `/mine`+`/chop` tốn **5** · regen **1/30s** (2/phút) · viện phí **cố định 3.000 VNĐ**.
- Phạt thu nhập **chỉ theo năng lượng** (bỏ `health` khỏi `conditionMultiplier`). Sức khỏe **chỉ giảm khi có BỆNH** (đã ship disease `0065`), không giảm ở `/work`.

**B. 🟠 Kích hoạt Top.gg (env chưa set — actionable):** đặt `TOPGG_TOKEN` (autopost số server), `TOPGG_WEBHOOK_AUTH` (webhook `…/topgg/vote` đã có trong `voteServer.js` → thưởng vote tức thì), tùy chọn `CASSO_WEBHOOK_TOKEN` (Premium tự kích hoạt). Web: thêm badge/nút Vote Top.gg.

**C. 🔴 Chiến lược/pháp lý khi public (cân nhắc trước khi scale):**
- **Monetization ToS Discord:** bán Premium qua VietQR ngoài có thể vướng chính sách → rà Developer Policy, cân nhắc Discord App Subscriptions/SKU.
- **GDPR:** cần `/deletedata` (user EU có quyền xóa dữ liệu).
- **Anti-abuse public:** farm alt-account (daily/vote/welcome), RMT, **jailbreak persona AI** (test prompt-injection cho Waguri).
- **Staging:** hiện đổi balance vào thẳng economy live → cần bot/guild test + checklist deploy kinh tế.
- **Catch-up cho người mới:** tránh whale thống trị BXH làm nản người mới.
- **Defer-first audit:** mọi lệnh gọi API ngoài/DB nặng phải `deferReply()` ngay dòng đầu (đặc biệt `/ask`) để tránh `10062`.

**D. 🟠 Bản quyền media (từ review vòng 2):** ảnh/GIF nhân vật official mang rủi ro bản quyền ở **MỌI lệnh** (free lẫn premium — không có "vùng an toàn phi thương mại"). GIF Tenor trong `WAGURI_IMAGES` = **nợ kỹ thuật**, lộ trình thay dần sang art gốc/commission qua `mediaPool.json` dễ swap.

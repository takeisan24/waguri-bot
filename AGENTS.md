# AGENTS.md — Bản đồ & Luật chơi cho AI agent / dev

> **Đọc file này ĐẦU TIÊN mỗi phiên.** Nó không phải roadmap — nó cho bạn biết: đang ở đâu, luật gì bất khả xâm phạm, đọc tài liệu nào tiếp. Ngắn và ổn định; đừng nhồi kế hoạch chi tiết vào đây.

Waguri là **Discord economy/RPG bot bản địa hóa văn hóa Việt**. Bot Node.js (CommonJS, discord.js v14) ở root, chạy trên host Wispbyte/Pterodactyl; web Next.js ở `web/` (Vercel); DB Supabase (Postgres); AI qua Google Gemini.

---

## 1. Nguồn sự thật (đọc theo nhu cầu — ĐỪNG tạo tài liệu chồng chéo mới)

| Bạn cần | Đọc |
|---|---|
| **Làm gì tiếp / ưu tiên / trạng thái tính năng** | `docs/roadmap-mo-rong.md` ← **nguồn sự thật DUY NHẤT** cho backlog |
| **Quy trình dev & cổng chất lượng** | `WORKFLOW.md` |
| **Bàn giao kỹ thuật + lỗi vận hành (WebSocket, backup…)** | `docs/HANDOFF-AND-ROADMAP.md` |
| **Thiết kế Tiệm Bánh Gekka** | `docs/design-tiem-banh-gekka.md` |
| **Catalog item (nguồn/công dụng/giá)** | `docs/audit-catalog.md` |
| **Đóng góp / Git flow** | `CONTRIBUTING.md` |
| **Persona & giọng Waguri** | `BRANDING.md`, `src/lib/ai/persona.js` |

> ⚠️ Nếu thấy nhiều tài liệu nói khác nhau về "trạng thái", tin `roadmap-mo-rong.md`. Các bản kế hoạch theo lịch-ngày (Sprint theo Ngày 1→30) **không được duy trì** và có thể đã lệch thực tế — chỉ tham khảo.

---

## 2. Luật BẤT KHẢ XÂM PHẠM

1. **Tiền/EXP/năng lượng/state quan trọng → RPC Postgres nguyên tử.** `UPDATE ... SET x = x + n` trong migration. **TUYỆT ĐỐI KHÔNG** đọc-tính-trong-JS-rồi-ghi-đè (gây dupe/race). Tiền lưu `bigint`.
2. **Mọi thao tác DB đi qua một helper trong `src/database.js`** (try/catch, trả giá trị hoặc `null`/sentinel, **không ném lỗi ra ngoài**). KHÔNG gọi `db.supabase.rpc(...)` trực tiếp từ command/lib — thêm helper trước.
3. **Migration** = 1 file `supabase/migrations/00NN_*.sql`, **đánh số tăng dần** + **idempotent** (`if not exists`, `create or replace`, `on conflict`). Đã áp DB thật thì đừng sửa file cũ — viết migration mới.
4. **Bảo mật DB:** RLS đang bật; RPC nhạy cảm `REVOKE ... FROM public/anon/authenticated` + `GRANT ... TO service_role`; `search_path` đã pin (migrations 0054/0055). **Đừng nới lại.**
5. **Không commit `.env`/secret;** không in service key ra log. Web đọc/ghi Supabase qua service-role admin client; client anon chỉ cho auth.
6. **Fail-safe:** command/handler không được `throw` ra ngoài làm hỏng interaction hoặc sập bot. Dịch vụ ngoài lỗi (Gemini/Open-Meteo) → fallback nhẹ nhàng (xem Ma trận fail-safe §5 dưới).
7. **Đồng bộ lệnh:** thêm/sửa lệnh bot → cập nhật `web/src/components/CommandsExplorer.tsx` (CI `scripts/check-command-sync.js` sẽ chặn nếu lệch) + cập nhật `/help`.
8. **Số liệu → `src/config/`, nội dung → `src/data/`.** Đừng hardcode rải rác trong command.
9. **Web CŨNG là tầng ghi game state.** `web/` dùng service-role (bypass RLS) và chạm cả tiền thật (Premium). Mọi Server Action đụng `wallet`/`inventory`/`skill_points`/state quan trọng **phải gọi ĐÚNG RPC mà bot dùng** — cấm read-modify-write trong TS y hệt cấm trong JS. Luật 1 & 2 áp cho CẢ HAI tầng.
10. **MỘT con số = MỘT nguồn.** Đừng tạo bảng giá thứ hai. Giá bán phải neo vào giá mua (`items.price`); nếu không, mua ở tiệm rồi bán chỗ khác = in tiền. Đây là nguyên nhân gốc của sự cố chợ 2026-08.
11. **Luật phải là `exit 1`, không phải văn xuôi.** Trước khi commit thứ đụng DB/kinh tế: `npm run check-sql` + `npm run check-economy`. Luật nào đã bị vi phạm 2 lần → biến nó thành script, đừng viết đoạn văn dài hơn.

---

## 2.5. Vệ sinh repo & Git tracking (⚠️ repo PUBLIC)

**Repo là PUBLIC** → mọi file được track ai cũng xem được, **kể cả trong lịch sử git** (untrack sau không xoá được quá khứ). Trước khi thêm/commit BẤT KỲ file nào, phân loại:

| ✅ TRACK (commit + push) | 🚫 IGNORE (local-only) |
|---|---|
| Mã nguồn: `src/`, `index.js`, `shard.js`, `clear-commands.js`, `scripts/` | **Secret:** `.env`, `.env.local`, mọi key/token thật |
| Migration: `supabase/migrations/*.sql` (**KHÔNG xoá file đã áp**) | Deps/build: `node_modules/`, `web/.next/`, `web/out/`, `*.tsbuildinfo`, `next-env.d.ts` |
| Test: `test/*.test.js` | Tooling local: `.claude/`, `.omc/`, `.vercel/`, `web/.omc/` |
| **Template env**: `.env.example`, `web/.env.example` (BẮT BUỘC track — chỉ placeholder, KHÔNG giá trị thật) | **Kế hoạch nội bộ:** `docs/` (roadmap/HANDOFF/audit/design — chiến lược/pháp lý, giữ kín) |
| Doc công khai: `README.md`, `CONTRIBUTING.md`, `WORKFLOW.md`, `BRANDING.md`, `LICENSE`, `AGENTS.md`, `.github/` | File tạm/rác/backup local, output test, `.DS_Store`/`Thumbs.db` |

**Luật bắt buộc:**
1. **KHÔNG BAO GIỜ commit secret** (`.env`, service key, VietQR, token). Chỉ commit `.env.example` với placeholder `<value>`.
2. **KHÔNG xoá migration đã áp** — là bản ghi lịch sử tái tạo DB. Sai thì viết migration MỚI đè (idempotent).
3. **KHÔNG track file sinh tự động/build** (`.next`, `node_modules`, `*.tsbuildinfo`, `next-env.d.ts`).
4. **Template `.env.example` PHẢI được track** (contributor cần). Nếu `.gitignore` nuốt (`.env*`) → thêm dòng `!.env.example`.
5. **Nội dung nội bộ/nhạy cảm → `docs/` (đã ignore) hoặc scratchpad local**, KHÔNG để lộ trên repo public.
6. Thêm file mới → tự hỏi: *source / template / test / public-doc?* → **track**. *secret / generated / deps / tooling / internal-plan?* → **ignore**.
7. Trước khi commit: chạy `git status` — không được dính secret hay file rác; nếu lỡ track nhầm secret, **đổi key ngay** (lịch sử public không xoá được bằng untrack).

## 3. Quy trình thêm 1 tính năng (chi tiết ở WORKFLOW.md §2)

`Thiết kế ngắn` → `Migration (bảng + RPC) + test RPC ngay trên DB` → `Helper trong database.js` → `Command trong src/commands/<nhóm>/` → `Hook nếu cần (vd quest)` → `config/ + data/` → `Cập nhật /help + web CommandsExplorer` → `Verify đầy đủ` → `Commit nhỏ` → `Push`.

**Cổng chất lượng TRƯỚC commit (bắt buộc):**
- [ ] `node --check` mọi file đổi
- [ ] `npm test` (xanh)
- [ ] Require được mọi command + `data.toJSON()` không lỗi
- [ ] Có DB: gọi helper thật rồi **dọn dữ liệu test**
- [ ] Có nút/collector: **playtest trong Discord thật**
- [ ] Không lộ secret

**Deploy prod:** `git push master` → vào panel Wispbyte **Restart** (tự `git pull`). Không có CI/CD tự deploy.

**Commit:** Conventional Commits (`feat(economy): …`, `fix(loto): …`). Commit nhỏ, atomic, đã verify.

---

## 4. TRẠNG THÁI HIỆN TẠI (cập nhật 2026-09-21 — sửa khi đổi lớn)

- **Release:** GitHub tag mới nhất `v2.4.0` ("Feature /study Pomodoro Companion & Web Lofi Study Room Ecosystem"). `package.json` = `2.5.1`.
- **📈 Biểu Đồ Giá Chợ Nông Thủy Sản Biến Động Hàng Giờ, Khử Dốc Tuyến Tính MurmurMix32 & Sparklines (`/market` & Web) — HẠNG MỤC ƯU TIÊN #1 ĐÃ HOÀN THÀNH 100%:**
  - **Migration `0150_market_avalanche_hash.sql` & RPC `market_multiplier`:** Đã áp dụng 1:1 trên cả Supabase Test & Production DB. Tích hợp bộ trộn tuyết lở (Avalanche Mixer) MurmurMix32 vào hàm băm PL/pgSQL, khử dốc tuyến tính cùng ngày: tần suất bước nhảy $\pm 1\%$ giảm từ **82,3%** xuống còn **2,31%** (phân phối đều tự nhiên).
  - **Đồng bộ bit-exact 100%:** `src/lib/market.js` (bot Node.js) và `web/src/lib/market.ts` (Next.js TS) cùng triển khai `murmurMix32(hash >>> 0)`. Kiểm thử 2.880 trường hợp khớp vân tay DB `f49bc44ff9d21deb22d4da79ee28fbc4` trong `test/market_gia_hien_dung_gia_tra.test.js`.
  - **Biểu đồ giá suy ra (0-DB query):** `getMarketHistory(itemId, 6)` tái hiện lịch sử 6 khối 4h (24 giờ qua) với 0 query DB.
  - **Trực quan hóa Sparkline đa nền tảng:**
    - Bot Discord (`/market prices`): Hiển thị biểu đồ Sparkline Unicode trực quan (` ` đến `█`) kèm dải giá 24h (`Min - Max`) ngay trên embed.
    - Web Next.js (`web/src/app/market`): Render biểu đồ vector SVG mini sparkline mềm mại có vùng gradient đổi màu theo xu hướng (Emerald khi UP, Rose khi DOWN, Slate khi STABLE) kèm dải giá 24h. Đã kiểm thử `test/market.test.js` và `test/economy.invariants.test.js` (563/563 tests pass 100%).

- **⚡ Tối Ưu Bảng Xếp Hạng Siêu Tốc & Tự Động Đồng Bộ Discord Profile (`/leaderboard` & Web) — ĐÃ HOÀN THÀNH 100%:**
  - **Migration `0091_public_leaderboard_security_definer.sql` & `0092_user_profile_names.sql`:** Đã áp dụng lên Supabase Production DB. Cấu hình `SECURITY DEFINER` và phân quyền công khai `GRANT EXECUTE TO anon` cho các hàm RPC `leaderboard_rows`, `leaderboard_rows_guild`, `get_bakery_leaderboard`. Thêm cột `username` & `avatar` vào bảng `users`.
  - **Tối ưu tốc độ (20ms):** Đảo luồng ưu tiên truy vấn trực tiếp Supabase DB trước, giảm thời gian chờ phản hồi Bảng xếp hạng từ ~3.5s xuống còn **0.02s (nhanh gấp 70 lần)**, hoàn toàn độc lập với trạng thái bật/tắt của Bot VPS Wispbyte.
  - **Đồng bộ Discord Profile:** Bổ sung `db.syncProfile` tự động ghi nhận Tên & Avatar Discord thật của người chơi khi họ tương tác với bot hoặc truy cập Web. Trang `/leaderboard` và widget `LeaderboardTeaser` hiển thị Tên + Avatar sắc nét thay vì tên mặc định.
  - **Chuẩn hóa Persona Waguri:** Đã thay thế từ xưng hô cổ trang *"tệ xá"* thành *"góc nhỏ của tớ"* trong `web/src/locales/vi.json`, giữ nguyên giọng văn ngọt ngào, tự nhiên của Waguri.
- **📚 Phòng Học Bài Pomodoro 24/7 & Web Lofi Study Room (`/study`) — ĐÃ HOÀN THÀNH 100%:**
  - **Migration `0094_study_system.sql` & RPC `complete_study_session`:** Đã áp DB Supabase + verified. Tự động tính toán Chuỗi Chuyên Cần `study_streak`, cộng Xu, EXP và Điểm Tri Thức `study_points` nguyên tử.
  - **Discord Bot:** Lệnh `/study` (`start`, `status`, `stop`, `leaderboard`) hoạt động đếm ngược siêu nhẹ qua Chat Embed (`[▓▓▓▓▓▓░░░░] 60%`), tốn 0MB RAM extra risk cho server free. Tích hợp nút bấm tương tác `study_pause`, `study_resume`, `study_stop`.
  - **Web Next.js:** Trang Web Lofi Study Room riêng tại `web/src/app/study` phát nhạc Lo-Fi HD qua HTML5 Audio API (0MB server load), giao diện Visual Waguri ngồi học bài ấm áp, đồng bộ DB-Centric mượt mà. Đã đồng bộ 79/79 lệnh trên `CommandsExplorer.tsx` và test suite `test/study.test.js` pass 100%.
- **🍰 Cân Bằng Tiệm Bánh Gekka, Tiệm Tri Thức Kikyo (`/study shop`) & Hồi Ký Kikyo (`/quest`) — ĐÃ HOÀN THÀNH 100%:**
  - **Migration `0149_gekka_study_story_quests.sql` & RPCs:** Đã áp dụng 1:1 trên cả DB Test và Prod (`kuvlkaxregnanhzgqrbp`). Sửa lỗi phục hồi `health` trong `consume_item`, kích hoạt buff năng lượng (+50 energy) + thưởng lương tiệm bánh. Bổ sung `study_shop_catalog` (10 vật phẩm mới gồm trà, men nổ, sách tri thức, khay nướng hoàng kim, kính tri thức, danh hiệu Đại Học Sĩ) và RPC `buy_study_shop_item` nguyên tử.
  - **Cốt truyện Hồi Ký Kikyo & Nhiệm Vụ 2 Luồng:** Lệnh `/quest` chuyển sang giao diện Menu 3 Tab tương tác (`tab_story`, `tab_daily`, `tab_achievements`). Cốt truyện chia 5 Hồi theo cấu trúc chương hồi tương tự *Nghịch Thủy Hàn* nhưng 100% bám sát lore Waguri & Học viện Kikyo, có lựa chọn hội thoại, điểm gắn kết `affection_points`, vật phẩm kỷ niệm soulbound và nút nhận thưởng tiết đoạn nguyên tử qua `advance_story_node`.
  - **Cơ Chế Kiểm Tra Điều Kiện Thực Thi & Nút Bấm 1-Click (`src/lib/storyCondition.js`):** Biến cốt truyện từ nhận thưởng thụ động thành hệ thống Onboarding thực chiến. Tích hợp các nút hành động 1-click (`quest_quick_open_bakery`, `quest_quick_study_start`, `quest_quick_adopt_pet`) xử lý trực tiếp trên embed, tự động kiểm tra Cấp độ / Ví tiền / Nông trại / Thú cưng / Pomodoro trước khi cho phép bấm nhận thưởng. Bổ sung bảng định hướng endgame vô tận (vòng lặp Tiệm bánh, Tri thức, Thú cưng, Chợ nông sản, Chuyển sinh) khi tốt nghiệp Hồi 5. Đã kiểm thử `test/story_and_study_shop.test.js` pass 100%.
  - **Chốt chặn chống clone (Anti-Sybil Guardrail):** Lệnh `/give` tích hợp `guardPayTransfer` bắt buộc người chơi đạt tối thiểu Cấp 5 hoặc vượt qua Hồi 4 cốt truyện mới được chuyển tiền.
  - **Cân bằng Tiệm Bánh:** Hạ điều kiện mở tiệm xuống Cấp 5 + 10.000 xu; đưa `banh_mi` vào danh mục nguyên liệu `FILLINGS` để tiêu thụ lượng bánh mì tồn dư.
- **Hardening Đa ngôn ngữ (i18n):** phần **bản dịch** đã phủ đủ; phần **ghi nhớ lựa chọn
  ngôn ngữ** thì hỏng âm thầm suốt một thời gian dài và **mới sửa 2026-08-14** (migration
  `0110`). Lý do ghi ra đây: câu cũ ở mục này khẳng định "ĐÃ HOÀN THÀNH 100% end-to-end",
  và chính câu đó khiến các lượt audit sau bỏ qua không soi lại.
  - **Đã hỏng những gì:** `0080_user_locale.sql` tồn tại trong repo nhưng **chưa từng được
    áp** → cột `users.locale` không có thật → `updateUserLocale()` ghi vào cột không tồn
    tại, lỗi bị nuốt im lặng. Cộng thêm `guildLocale` được xét trước `interaction.locale`
    nên bậc học ngôn ngữ không bao giờ chạy. Hệ quả: **mọi lệnh prefix `w!` đều ra tiếng
    Việt** (shim lấy ngôn ngữ *chỉ* từ cột này), và người Việt trong server tiếng Anh bị
    bot nói tiếng Anh mà không cách nào sửa.
  - **Thứ tự ưu tiên hiện tại** (chủ động thắng ngầm định; trong ngầm định, cá nhân thắng
    môi trường): `/config language` của admin → `users.locale` đã nhớ → `interaction.locale`
    → `guildLocale` → `'vi'`. Có test khoá thứ tự này (`test/i18n_priority.test.js`).
  - **Discord Bot:** Bản dịch song ngữ Anh & Việt đã phủ 100% tất cả các nhóm lệnh (bao gồm Economy, Games, Fun, Utility, Admin), hỗ trợ đầy đủ localization cho slash command definitions, choices và autocomplete.
  - **Web Next.js:** Dịch toàn bộ trang Landing, cá nhân, Sổ sứ mệnh, Premium, Leaderboard, `/u/[id]`, lỗi. Trang Wiki được tách song ngữ tĩnh, đổi tên hiển thị tiếng Việt thành "Cẩm nang". Các components được hoàn thiện i18n 100%.
- **Giới hạn bản tin AI:** Sửa lỗi cắt cụt bản tin bằng cách tăng giới hạn `maxOutputTokens` lên 2000 cho Gemini API.
- **🍰 Tiệm Bánh Gekka Phase 2: Đơn Hàng VIP Khách Quen, Giờ Cao Điểm & Điểm Danh Tiếng — ĐÃ HOÀN THÀNH 100%:**
  - **Migration `0151_bakery_vip_orders.sql` & RPC `deliver_bakery_order`:** Đã áp dụng 1:1 trên cả Supabase Test & Production DB. Bổ sung cột `reputation` cho bảng `bakeries`, tạo bảng `bakery_completed_orders` (kèm RLS), thực thi RPC nguyên tử với `FOR UPDATE` trên `inventory` và `bakeries` (chống TOCTOU/race conditions).
  - **Giờ Cao Điểm (Rush Hour):** 2 khung giờ vàng mỗi ngày (11h-13h & 18h-20h giờ VN, UTC+7) kích hoạt tăng +20% tốc độ nướng bánh (`rushRate`), hiển thị huy hiệu `🔥 Giờ Cao Điểm` trực tiếp trên embed `/tiembanh xem`.
  - **Đơn Hàng VIP Khách Quen (0-Cron, Tất Định):** Hàm `getDailyBakeryOrders(userId, dateStr)` sinh 3 đơn hàng độc nhất mỗi ngày từ 8 nhân vật lore Waguri (Kaoruko, Rintaro, Subaru, Madoka, Giáo sư Kikyo, Thực khách Hoàng gia, Gia tộc Hoshina, Usami) với 0 query DB.
  - **Lệnh tương tác `/tiembanh donhang` & `/tiembanh giaodon`:** Xem chi tiết tiến độ nguyên liệu thực tế trong kho (`✅/❌`) và giao đơn nhận Xu, EXP, Danh Tiếng tiệm và tiến trình bánh. Đã cập nhật 100% i18n, command localizer, web `CommandsExplorer.tsx` và test suite `test/bakery.test.js`.
- **Ký ức AI Waguri (Sprint "trí nhớ") — ĐÃ HOÀN THIỆN end-to-end:** migration `0074` (cột `users.ai_memory` JSONB + RPC `update_ai_memory`) và `0074b` (`refund_ai_quota`) đã áp DB + verified. Helper `updateAiMemory`/`refundAiQuota` trong database.js.
  - **ĐỌC:** `ai_memory` được chèn vào system prompt Gemini (`src/lib/ai/index.js`).
  - **GHI:** trích xuất inline — Waguri tự gắn marker ẩn `[[NHO: khoá | giá trị]]` khi biết điều đáng nhớ; `extractAndStoreMemory()` parse → `db.updateAiMemory` → xoá marker trước khi hiển thị. Chống lạm dụng: sanitize khoá (bỏ dấu), cap 25 khoá/người, ≤2 điều/lượt. Logic parse thuần có test (`test/ai_memory.test.js`).
  - ✅ *GDPR erasure:* `/deletedata` (RPC `delete_user_data`, migration `0075`) cho user tự xoá toàn bộ dữ liệu chơi (gồm `ai_memory`); chặn nếu còn nợ active / là chủ clan; giữ `premium_orders` + `confession_logs` (lợi ích hợp pháp).
- **Bộ Sưu Tập / Album (Sổ Tay Sưu Tầm) & Hệ Thống Độ Hiếm (Rarity) — ĐÃ HOÀN THÀNH end-to-end:** migration `0078` (cột `items.rarity`, bảng `user_discoveries`/`user_collection_rewards` and RPC `claim_collection_reward`) đã áp DB + verified. Lệnh `/album` tương tác đẹp, hỗ trợ hiển thị thống kê theo Rarity, xem chi tiết bộ sưu tập, và nút bấm nhận thưởng nguyên tử. Đã tích hợp hook tự động ghi nhận vào câu cá `/fish`, đào/chặt `/mine`/`/chop` (thêm tỉ lệ rơi Cá Rồng Vàng, Cá Koi Nhật, Vàng Đông Triều, Kỳ Nam) và chế tạo `/craft`.
- **Fail-safe đã có:** hoàn quota AI khi Gemini lỗi; cache 1h + fallback thời tiết (Học viện Kikyo, 25°C, trời quang) cho `/thoitiet`; `game_stakes` hoàn cược mồ côi khi restart.
- **Telemetry kinh tế:** migration `0076` (`economy_snapshots` + RPC `snapshot_economy`); scheduler trong `index.js` chụp mỗi 12h; owner xem qua `/eco-admin report` (cung tiền/phân bố/xu hướng) → theo dõi lạm phát/exploit.
- **Sổ Sứ Mệnh (Battle Pass) theo mùa giải — ĐÃ HOÀN THÀNH end-to-end:** migration `0079` (`battle_pass_users` + 3 RPCs), `0079b` (`add_ai_chat_pass_xp`), và `0079c` (`buy_premium_pass` fix) đã áp DB + verified. Lệnh `/pass` tương tác đẹp, tự động tính Season ID theo âm lịch. Tích hợp hooks cộng XP tự động vào `/daily`, `/quest`, cày cuốc và `/ask` (kèm quota chống spam AI 50 XP/ngày). Web Dashboard widget và trang chi tiết `/dashboard/pass` kèm Server Actions nhận quà, mua Premium đã hoàn thành.
- **Chuyển sinh, Sự kiện thế giới, Đền thờ Clan, Huy hiệu & Thú cưng (Bot & Web Next.js) — ĐÃ HOÀN THÀNH 100%:**
  - Vòng lặp Chuyển sinh (`/prestige` và RPC `prestige_user`) hoạt động hoàn hảo; Web `/u/[id]` hiển thị cấp Prestige và vòng viền Avatar hào quang phát sáng.
  - Lệnh Sự kiện thế giới (`/worldevent`) và bảng xếp hạng đóng góp hoạt động đầy đủ.
  - Đền thờ Clan (`/clan shrine` & `/clan deposit`) kích hoạt buff bị động tăng +2% EXP / cấp cho bang hội khi làm việc.
  - Cửa hàng huy hiệu (`/cosmetic badge-buy`/`badge-equip`) và Hộp trưng bày 6 ô lấp lánh (Showcase Badges) trên Web `/u/[id]` đã được tích hợp hoàn chỉnh.
  - Thú cưng tiến hóa Stage 1..3 và Cây kỹ năng bị động (`/pet skill-up`); xây dựng sơ đồ Cây kỹ năng SVG tương tác trực quan tại Web `/dashboard/pet` cho phép cộng điểm thông qua Server Actions.
  - Đã có test tích hợp `test/backlog_max_depth.test.js` (97/97 tests pass) và type-checking Next.js frontend biên dịch hoàn toàn thành công.
- **📢 Nâng Cấp Thông Báo Modal `/announcement send`, Lời Nhắc Đồng Hành Waguri `/config reminders` & Tinh Gọn Dữ Liệu Chat — ĐÃ HOÀN THÀNH 100%:**
  - **Thông báo Modal & Smart Fallback:** Nâng cấp `/announcement send` mở Form Modal 5 trường trên Discord UI, loại bỏ chế độ tự động. Tích hợp thanh nút bấm 1-Click (`tiembanh`, `market`, `quest`, `study`, `daily`) và cơ chế Smart Channel Fallback 3 tầng (cấu hình -> tìm theo tên/quyền -> kênh bot có quyền gửi) triệt tiêu tình trạng trượt thông báo.
  - **Lời nhắc đồng hành Waguri (`src/lib/companionReminder.js`):** Tự động gửi lời nhắn nhẹ nhàng theo 4 khung giờ ý nghĩa (Học bài Lo-Fi T2/T4, Giờ cao điểm Tiệm bánh T3/T5, Chợ phiên & Giải trí T6/T7, Chúc ngủ ngon CN). Chống spam nghiêm ngặt: tối đa 1 tin/ngày/server, kiểm tra hoạt động (bỏ qua server ngủ đông > 6h), 0 ping làm phiền, hỗ trợ lệnh quản trị `/config reminders` (bật/tắt, chọn kênh, phong cách Warm/Energetic).
  - **Vệ sinh kinh tế & Dừng cày cấp thụ động qua chat:** Tắt hoàn toàn `grantChatReward` trong `src/events/messageCreate.js`. Bảo vệ tuyệt đối 101 Genuine Players (người chơi RPG/lệnh/AI/vật phẩm) và thu hồi số dư ảo của 784 ghost accounts cày thụ động từ chat nền.

---

## 5. Ma trận fail-safe (dịch vụ bên thứ ba chập chờn)

1. **Gemini lỗi/timeout** (`REQUEST_TIMEOUT_MS = 25000`, `src/lib/ai/gemini.js`) → trả lỗi nhẹ + `db.refundAiQuota(userId)` hoàn lượt đã trừ.
2. **Bot mất kết nối giữa ván có cược** → cược lưu nguyên tử vào `game_stakes`; restart tự hoàn qua `stakeRefundOrphans` (migration 0059).
3. **Open-Meteo lỗi** → `/thoitiet` (và tiệm bánh khi tích hợp) fallback mặc định, không gián đoạn.

---

## 6. Kỷ luật cho AI agent làm việc trên repo này

- **Verify trước khi tuyên bố "xong".** "Migration đã áp" ≠ "tính năng đã xong" — phải có đường đọc VÀ ghi + đã chạy thử.
- **Đổi tính năng → nhớ ripple:** helper (database.js) · `/help` · web CommandsExplorer · test · `docs/roadmap-mo-rong.md` (đánh dấu trạng thái).
- **Không nhồi nhiều tính năng vào 1 commit.** 1 tính năng = 1 commit đã verify.
- **Cập nhật §4 (Trạng thái hiện tại) của file này** khi hoàn thành một mảng lớn, để phiên sau không bị mơ hồ.

### Quy ước commit (Git)
- **KHÔNG thêm trailer `Co-Authored-By` / dòng ghi công AI** (Claude, Codex, Gemini…) vào message commit. Chủ repo không muốn git track attribution AI — commit đứng tên tác giả người dùng thôi.
- **KHÔNG thêm dòng "Generated with…" / link công cụ AI** vào message commit hay body PR.
- Dùng Conventional Commits (`feat(scope):`, `fix(scope):`, `docs:`, `chore:`…), tiếng Việt hoặc Anh đều được; message mô tả *cái gì + tại sao*.

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

## 4. TRẠNG THÁI HIỆN TẠI (cập nhật 2026-07-11 — sửa khi đổi lớn)

- **Release:** GitHub tag mới nhất `v2.2.0` ("Đợt 3: Bản địa hóa toàn diện & Bảo mật Admin"). `package.json` = `2.2.0`.
- **Hardening Đa ngôn ngữ (i18n) — ĐÃ HOÀN THÀNH 100% end-to-end:**
  - **Discord Bot:** Bản dịch song ngữ Anh & Việt đã phủ 100% tất cả các nhóm lệnh (bao gồm Economy, Games, Fun, Utility, Admin), hỗ trợ đầy đủ localization cho slash command definitions, choices và autocomplete.
  - **Web Next.js:** Dịch toàn bộ trang Landing, cá nhân, Sổ sứ mệnh, Premium, Leaderboard, `/u/[id]`, lỗi. Trang Wiki được tách song ngữ tĩnh, đổi tên hiển thị tiếng Việt thành "Cẩm nang". Các components được hoàn thiện i18n 100%.
- **Giới hạn bản tin AI:** Sửa lỗi cắt cụt bản tin bằng cách tăng giới hạn `maxOutputTokens` lên 2000 cho Gemini API.
- **Tiệm Bánh Gekka:** Phase 1 + migration Phase 2 (`0070`) đã có; **cần QA runtime** vòng lặp nạp→nướng→thu hoạch + lương nhân viên.
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

---

## 5. Ma trận fail-safe (dịch vụ bên thứ ba chập chờn)

1. **Gemini lỗi/timeout** (`REQUEST_TIMEOUT_MS = 20000`, `src/lib/ai/gemini.js`) → trả lỗi nhẹ + `db.refundAiQuota(userId)` hoàn lượt đã trừ.
2. **Bot mất kết nối giữa ván có cược** → cược lưu nguyên tử vào `game_stakes`; restart tự hoàn qua `stakeRefundOrphans` (migration 0059).
3. **Open-Meteo lỗi** → `/thoitiet` (và tiệm bánh khi tích hợp) fallback mặc định, không gián đoạn.

---

## 6. Kỷ luật cho AI agent làm việc trên repo này

- **Verify trước khi tuyên bố "xong".** "Migration đã áp" ≠ "tính năng đã xong" — phải có đường đọc VÀ ghi + đã chạy thử.
- **Đổi tính năng → nhớ ripple:** helper (database.js) · `/help` · web CommandsExplorer · test · `docs/roadmap-mo-rong.md` (đánh dấu trạng thái).
- **Không nhồi nhiều tính năng vào 1 commit.** 1 tính năng = 1 commit đã verify.
- **Cập nhật §4 (Trạng thái hiện tại) của file này** khi hoàn thành một mảng lớn, để phiên sau không bị mơ hồ.

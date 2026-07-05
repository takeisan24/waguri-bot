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

## 4. TRẠNG THÁI HIỆN TẠI (cập nhật 2026-07-05 — sửa khi đổi lớn)

- **Release:** GitHub tag mới nhất `v2.0.0` ("Đợt 1: Tái Cấu Trúc UX & Trỗi Dậy Sức Mạnh Thú Cưng"). `package.json` = `2.0.0`.
- **Tiệm Bánh Gekka:** Phase 1 + migration Phase 2 (`0070`) đã có; **cần QA runtime** vòng lặp nạp→nướng→thu hoạch + lương nhân viên.
- **Ký ức AI Waguri (Sprint "trí nhớ") — ĐÃ HOÀN THIỆN end-to-end:** migration `0074` (cột `users.ai_memory` JSONB + RPC `update_ai_memory`) và `0074b` (`refund_ai_quota`) đã áp DB + verified. Helper `updateAiMemory`/`refundAiQuota` trong database.js.
  - **ĐỌC:** `ai_memory` được chèn vào system prompt Gemini (`src/lib/ai/index.js`).
  - **GHI:** trích xuất inline — Waguri tự gắn marker ẩn `[[NHO: khoá | giá trị]]` khi biết điều đáng nhớ; `extractAndStoreMemory()` parse → `db.updateAiMemory` → xoá marker trước khi hiển thị. Chống lạm dụng: sanitize khoá (bỏ dấu), cap 25 khoá/người, ≤2 điều/lượt. Logic parse thuần có test (`test/ai_memory.test.js`).
  - 🔜 *Nice-to-have sau:* lệnh `/nho` thủ công + UI xem/xoá ký ức (`/quenki`) cho minh bạch (GDPR).
- **Fail-safe đã có:** hoàn quota AI khi Gemini lỗi; cache 1h + fallback thời tiết (Học viện Kikyo, 25°C, trời quang) cho `/thoitiet`; `game_stakes` hoàn cược mồ côi khi restart.
- **Gap nền tảng:** xem `docs/roadmap-mo-rong.md §5` (telemetry kinh tế, paginate embed dài, gom `lib/messages.js`).

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

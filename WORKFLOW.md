# WORKFLOW — Quy trình phát triển Waguri (để ra code chất lượng)

Tài liệu này mô tả cách làm việc trên Waguri: nên theo gì, tránh gì, cần kỹ năng nào.

---

## 0. Triết lý cốt lõi
1. **Verify trước khi tuyên bố xong.** Mọi thay đổi phải qua: `node --check` → `npm test` → build thử lệnh → test tích hợp DB → (nếu có nút bấm) playtest thật. Không "chắc là chạy".
2. **Dữ liệu quan trọng phải NGUYÊN TỬ.** Tiền/EXP/năng lượng/cooldown/kết hôn... luôn xử lý qua **RPC Postgres** (`UPDATE ... SET x = x + n`), KHÔNG đọc-rồi-ghi trong JS (gây dupe/race).
3. **Commit nhỏ, verify từng bước, push thường xuyên.** Mỗi tính năng = 1 commit hoàn chỉnh đã test.
4. **Giữ bản sắc.** Persona Waguri dịu dàng + tiếng Việt nhất quán; bám config (số liệu) & data (nội dung), không rải rác.

---

## 1. Môi trường & vòng lặp dev
- **Local (dev):** `npm run dev` (nodemon). Đặt `GUILD_ID` trong `.env` → slash command cập nhật **tức thì** trong server test (không phải chờ ~1h global).
- **Prod (Wispbyte):** `git push` → vào panel **Restart** (tự `git pull`). Node 20+.
- **Database (Supabase):** mỗi thay đổi schema/RPC = 1 file `supabase/migrations/000N_*.sql` (đánh số tăng dần, **idempotent**), áp dụng vào project. Code đọc/ghi qua `src/database.js`.

## 2. Quy trình thêm 1 tính năng (theo đúng thứ tự)
1. **Thiết kế ngắn:** lệnh làm gì, cần state gì, cân bằng ra sao.
2. **DB (nếu cần lưu/giao dịch):** viết migration (bảng + RPC atomic) → áp dụng → **test RPC ngay trên DB**.
3. **DB helper** trong `src/database.js` (try/catch, trả giá trị/`null`, không ném lỗi ra ngoài).
4. **Lệnh** trong `src/commands/<nhóm>/*.js` — viết theo kiểu `interaction` (tự chạy cả slash + prefix nhờ shim).
5. **Hook** nếu cần (vd cộng tiến độ quest từ /work).
6. **Số liệu → `config/`, nội dung → `data/`.** Đừng hardcode trong lệnh.
7. **Cập nhật `/help`.**
8. **Verify đầy đủ → commit → push.**

## 3. Cổng chất lượng TRƯỚC khi commit
- [ ] `node --check` mọi file đổi.
- [ ] `npm test` (unit cho logic thuần như leveling/amount).
- [ ] Build thử: require mọi command + `data.toJSON()` không lỗi.
- [ ] Test tích hợp DB: gọi helper thật rồi **dọn dữ liệu test**.
- [ ] Lệnh có nút/collector (blackjack, lixi, marry, pagination) → **playtest trong Discord thật**.
- [ ] Không lộ secret; `.env` vẫn bị gitignore.

---

## ✅ NÊN theo
- Tiền/EXP/state quan trọng → **RPC atomic**; chuyển khoản/mua/bán → 1 transaction.
- `try/catch` quanh mọi truy vấn DB; bot **fail-safe**, không bao giờ sập vì 1 lỗi lẻ (đã có `unhandledRejection`/`uncaughtException`).
- Viết lệnh **context-agnostic** (dùng `interaction.options.*`, `editReply`...) để chạy cả slash lẫn prefix.
- Migration đánh số tăng + idempotent (`if not exists`, `create or replace`, `on conflict`).
- Lệnh ngắn gọn, embed nhất quán màu (`config.COLORS`), tiếng Việt + giọng Waguri.
- Nội dung (kịch bản, bảng cá, quest, thành tựu) tách ra `src/data/` để dễ chỉnh.

## ❌ KHÔNG nên
- ❌ Đọc số dư → tính trong JS → ghi đè (race/dupe). Luôn để DB tự cộng.
- ❌ Hardcode số cân bằng (lương/giá/tỉ lệ) rải rác — để trong `config/`.
- ❌ Commit `.env` / in key ra log.
- ❌ `throw` không bắt trong lệnh/handler (làm hỏng tương tác hoặc sập).
- ❌ `ephemeral: true` (deprecated) — dùng `flags: MessageFlags.Ephemeral`.
- ❌ Dùng `Number` cho tiền cực lớn — để cột `bigint` + RPC lo.
- ❌ Lưu state cần bền vào RAM (mất khi restart) — dùng DB. (RAM chỉ cho thứ tạm: ngữ cảnh AI, cooldown nhẹ.)
- ❌ Nhồi tính năng mới khi chưa playtest & cân bằng cái cũ.

---

## 4. Kỹ năng cần để ra code chất lượng nhất
1. **JavaScript (async/await, closure, Map/Set) + Node.js** — nền tảng.
2. **discord.js v14**: slash builder, **interactions**, **components + collectors** (nút/menu), **intents** (đặc biệt MessageContent privileged), embeds, permissions.
3. **SQL/PostgreSQL + Supabase**: viết **plpgsql RPC**, hiểu **tính nguyên tử/transaction**, `jsonb`, index, RLS & service key.
4. **Thiết kế cân bằng kinh tế/game**: sources vs sinks, chống lạm phát, house edge, đường cong tiến triển (level/giá).
5. **Git**: commit nhỏ atomic, message rõ, nhánh khi cần.
6. **Bảo mật cơ bản**: quản lý secret, không lộ service key ra client, nguyên tắc least-privilege.
7. **Prompt engineering**: viết system prompt persona cho AI (đã dùng cho Waguri).
8. **Kỷ luật testing/verify**: viết test cho logic thuần; nghĩ edge case; luôn dọn dữ liệu test.

---

## 5. Lộ trình giữ chất lượng khi lớn dần
- **Playtest gate:** trước mỗi đợt mở rộng lớn, chơi thử thật + sửa cân bằng/bug nút bấm.
- **Theo dõi lạm phát:** nhiều nguồn thu (work/fish/daily/quest/lixi/gamble) → quan sát ai giàu bất thường, chỉnh số trong `config/`.
- **Tăng độ phủ test** cho logic thuần (leveling, parse, chia lì xì...).
- **Khi public/multi-server:** thêm `guild_settings` (config per-guild), cân nhắc deploy-lệnh-khi-đổi (thay vì mỗi lần khởi động), observability (log/metrics).

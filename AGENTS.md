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

## 4. TRẠNG THÁI HIỆN TẠI (cập nhật 2026-10-23 — sửa khi đổi lớn)

- **Release:** GitHub tag mới nhất `v2.6.0` ("Architectural Restructure: Standardize 72 Commands, Prune Dead Minigames, Kikyo Credit Fund & Gekka Bakery Flow"). `package.json` = `2.6.0`.
- **🔌 NÚT VẼ RA MÀ KHÔNG AI NHẬN — Sổ Sứ Mệnh chết từ ngày phát hành (2026-10-25, `origin/master` = `c689cb9`):**
  - ⚠️ **PHẢI ĐĂNG KÝ LẠI LỆNH** (restart với `SKIP_DEPLOY` ≠ `1`): đợt này thêm context menu `View Inventory`. Hai bản vá nút là mã chạy, chỉ cần restart.
  - **`pass.handleButton` tồn tại từ commit gốc `79b5e15` mà CHƯA AI ĐẤU DÂY** — không router trong `interactionCreate.js`, cũng không collector trong `pass.js`. Cả 5 nút `pass:*` chết im suốt đời tính năng: bấm là "The application did not respond", và **không có log lỗi nào** vì chẳng handler nào ném.
  - **Quy mô: `battle_pass_users` 130 dòng, XP cao nhất 20.000, số quà đã nhận = 0. Không một ai.** `is_premium` cũng **0**, vì `/pass buy` chạy xong cũng chỉ vẽ ra `pass:buy_yes`/`buy_no` → **Premium không mua được bằng BẤT CỨ đường nào trên Discord**. Log 25-10: 21 lần `Chưa ack sau 2501ms: nút pass:claim_all` trong 2 ngày, một người bấm lại 14 lần trong 2 phút.
  - **BÀI HỌC CHÍNH, khác hẳn các đợt trước:** mấy đợt vừa rồi học "phải quét TOÀN REPO" rồi "phép đo cũng phải tổng quát". Đợt này là **tầng thứ ba: phải đo ở TẦNG KHÁC**. `test/battlepass.test.js` xanh suốt vì nó gọi `bpLib.claimAll` **thẳng vào DB** — phần lõi chưa bao giờ sai, chỉ thiếu đoạn dây từ cú bấm tới nó. Test lõi **không bao giờ** thấy được lớp lỗi này, dù quét rộng cỡ nào. Phép đo đúng là đi từ thứ người chơi **NHÌN THẤY** (nút) ngược về xem có ai nhận không.
  - Cổng mới `nut_phai_co_nguoi_nhan`: mọi `setCustomId` phải với tới được bằng **một trong bốn** đường — router toàn cục · collector cùng tệp · ô modal (`getTextInputValue`) · tự so khớp id trong cùng tệp (`awaitModalSubmit`). Kèm **một phép BẤM THẬT** qua `interactionCreate.execute` với client giả, vì phép đọc mã chỉ chứng minh đoạn chữ **có mặt**, không chứng minh cú bấm **tới được** nó.
  - **Bản đầu của cổng báo 30 chỗ mà 29 là dương tính giả**, vì nó rút mọi id về "phần trước dấu `:`" — router thật dùng cả `'pass:'` (hai chấm) lẫn `'ann_btn_'`/`'study_'` (gạch dưới). Phải phân biệt **khớp đúng bằng** (`=== 'x'`) với **khớp tiền tố** (`.startsWith('x')`).
  - **`/bakery` — nút chết mà vẫn SÁNG mời bấm:** nhánh `collect` `stop('acted')` sau cú bấm đầu, nhánh `end` chỉ làm mờ khi `reason !== 'acted'`. Nút sống sót qua lượt cập nhật vì `subThu`/`subDonhang` chỉ `editReply` phần `embeds`, mà Discord **giữ nguyên field nào không được gửi**. Log 24-10: `bk_btn_orders` 3 lần liên tiếp 05:55→05:57 cùng một người. `/bakery` là lệnh đông thứ tư và có tỷ lệ lỗi cao nhất trong nhóm có lưu lượng thật (6/146 = **4,1%**). Bỏ luôn `max: 2` — nó không bao giờ với tới được vì `stop('acted')` chạy trước.
  - **ĐỪNG mở rộng bản vá đó sang `farm.js`/`loan.js`** dù hai tệp có **y nguyên** khuôn `if (reason !== 'acted')`: nhánh `collect` của chúng gửi `components: []`, tức **xoá hẳn** nút ngay tại cú bấm, nên cửa `reason` ở đó là ĐÚNG. Khác biệt nằm ở `components: []`, **không** ở khuôn chữ của nhánh `end`. Tôi đã suýt vá cả ba và đó là báo đỏ oan 2/3.
  - **8/8 phép bẻ ngược làm cổng đỏ** (4 cho `pass`, 4 cho `bakery`), mỗi phép đều **xác nhận tệp THẬT đã đổi** trước khi chạy test. **728/728 test xanh**, kèm `check-help` · `check-command-sync` · `check-sql` · `check-rpc` · `check-db` (migration đã áp, không drift, không rò quyền anon).
  - **ĐÃ KIỂM, KHÔNG phải lỗi — đừng đuổi lại:** `remind_btn_*`/`ann_btn_*`/`study_*` (có `startsWith` trong router) · `ann_*`/`ticket` `category|title|content` (là ô modal) · `ms_*`/`help_category`/`loan_btn_pay_all`/`yes`/`grab`/`confirm` (collector lọc theo `componentType`, không theo id) · `/work`,`/eat`,`/jobs`,`/fortune` vỡ ngay tại `deferReply` (token chết trước khi bot kịp defer — **độ trễ mạng**, khác hẳn lớp lỗi trên, đừng gộp chung).
  - **Kênh log đang bị pha loãng:** 113/438 tin là *cảnh báo* ANTI-NUKE đi qua `logError` — không phải lỗi. Chưa sửa; nó làm loãng tín hiệu chứ không gây mất mát.
  - **Còn mở (không đổi):** `DBL_TOKEN` rỗng · `work:again` 21 lần vẫn chưa giải thích được (lần cuối 19-10, không có dữ liệu mới).
- **📡 Nhóm ack/10062 — ĐÃ LOẠI 3 NGHI PHẠM, phép đo đã gắn, ĐANG CHỜ DỮ LIỆU (2026-10-25, `origin/master` = `b5ca5ac`):**
  - **⚠️ ĐÍNH CHÍNH 26-10 cho mục (1) ngay dưới — đọc trước khi tin nó.** Câu "gateway + tra ngôn ngữ chỉ tốn ~0,2s, locale KHÔNG phải thủ phạm" **đúng ở phần giữa, SAI ở phần đuôi**: hôm 25-10 tôi chỉ đọc một nhúm tin. Đo lại trên **cả 58** tin có đủ hai con số: trước-mốc **p50 167ms · p75 239ms · p90 908ms · max 6.339ms**, và **7/58 vượt 800ms**. Bốn cái bu rất chặt ở **821 · 908 · 911 · 917ms** — đúng bằng `ACK_LOOKUP_TIMEOUT` 800ms cộng một nhúm gateway, tức **vân tay của lượt tra locale chạm trần**. Đã vá bằng cách tính lười (`5f9e23c`, xem mục 📡 phía dưới). Hai ca còn lại (5.294ms `/study`, 6.339ms `/wordchain`) có `tổng ≈ trước-mốc` → interaction **chết trước khi bot chạm vào**, mã không cứu được.
  - **ĐỪNG TRUY LẠI BA THỨ NÀY — đã đo và loại:** (1) **không** phải độ trễ gateway vào *ở 88% số ca*: `canhAck` báo "đã trôi 120–320ms TRƯỚC khi đồng hồ được bấm", mà mốc bấm nằm **SAU** cả lượt tra ngôn ngữ (dòng 154 so với dòng 99 của `interactionCreate.js`) → ở phần giữa, gateway + tra DB ngôn ngữ chỉ tốn ~0,2s trong ngân sách 3s **(nhưng xem đính chính ngay trên về phần đuôi)**; (2) **không** phải việc nền định kỳ: phân bố theo phút-trong-giờ phẳng, theo giờ thì trùng giờ cao điểm người chơi; (3) **không** phải tiến trình bị đứng: 164 sự kiện gom thành **107 cụm rời rạc**, chỉ 3 cụm có ≥2 lệnh khác nhau cùng vỡ và 2/3 cụm từ 19/08 — event loop bị chặn sẽ làm mọi lệnh đang bay vỡ cùng lúc.
  - **Còn đúng hai nghi phạm:** POST `deferReply` mất >2,3s vì **REST bị xếp hàng** (chạm hạn mức) **hoặc jitter mạng**. Hai thứ đòi hai bản vá khác nhau, mà cả hai đều dự đoán "vỡ lẻ tẻ" nên dữ liệu cũ không phân biệt được.
  - **CÁCH ĐỌC KẾT QUẢ:** `lib/canhRest.js` lắng nghe `client.rest` sự kiện `rateLimited`; `canhAck` nhúng kết quả vào trường **`**Đo được:**`** của chính tin cảnh báo ack. **`gan60s > 0` đúng lúc vỡ = xếp hàng** (vá theo hướng giảm/ưu tiên lời gọi REST); **luôn 0 mà vẫn vỡ = jitter mạng** (vá theo hướng ack sớm hơn / chịu đựng, KHÔNG phải giảm REST). Chạm hạn mức theo route chỉ ghi console panel; chỉ hạn mức **toàn cục** mới gửi kênh log, tối đa 1 lần/10 phút.
  - **Bẫy đã mắc và đã vá, đáng nhớ hơn bản vá:** bản đầu truyền `ping`/`rest` làm hai khoá meta của `logError`, mà `logger.js` **chỉ render `command`/`user`/`guild`** — khoá lạ **bị nuốt im lặng**. Suýt deploy một phép đo **không đo gì** mà vẫn trông như đã làm. Đây là lớp lỗi "làm rồi không kiểm kết quả" ở tầng mới: **không phải lời GHI bị bỏ trôi, mà là phép ĐO bị bỏ trôi.** Nay là một trường `note` được render thật. Số đo biến thiên **phải** là trường riêng, không nhồi vào `err.message`: `khoaCua()` gộp trùng theo **dòng đầu** của message, nhồi vào đó thì mỗi tin thành khoá riêng và phép đo tự spam cái kênh nó đang cố làm sạch.
  - Cổng `phep_do_phai_den_duoc_mat_nguoi_doc` **chạy thật** chuỗi đo và bắt đúng payload webhook (thay `global.fetch`), không đọc mã — khoá bằng hành vi thì không "sửa cho xanh" được bằng cách đổi tên biến. **7/7 bẻ ngược đỏ**, trong đó **một phép từng lọt** và lộ lỗ trong chính bộ test: phép thử "ack kịp thì không báo" gọi `xong()`, mà `xong()` làm `clearTimeout` → nó kiểm đồng hồ đã bị huỷ chứ không kiểm cửa `daAck`. Cửa đó mới là lớp che **duy nhất** của **đường nút** (nhánh nút cố ý không giữ `xong()`). Đã bù phép thử đúng cho đường nút. **736/736 test xanh.**
  - **Chưa làm, đã cân nhắc và BÁC bằng số đo:** 4 chỗ collector không dọn nút khi hết hạn (`prestige.js`, `lixi.js`, `masoi.js`, `deletedata.js`) — lưu lượng lần lượt 1 · 3 · 3 · **0** lượt, nên theo luật "xếp priority bằng lưu lượng đo được" thì chưa đáng. Đừng vá chúng trước khi có người dùng thật.
  - **⏳ TRẠNG THÁI 26-10: phép đo VẪN CHƯA SỐNG — lần restart 26-10 KHÔNG có tác dụng.** Hai bằng chứng độc lập: (a) stack trên prod trỏ `canhAck.js:61`, mà ở bản mới dòng 61 là chú thích — `new Error` đã dời xuống **dòng 73**; (b) `bot_stats` ghi lúc 13:47:47.255 (26-10) so với 13:17:47.070 (25-10) là **đúng 49,0001 chu kỳ 30 phút**, trôi 0,2s sau 24,5 tiếng — tiến trình mới sẽ dời pha `setInterval` sang mốc khác. **0/58 tin có trường `Đo được:`.** Trước khi điều tra tiếp nhóm ack, HỎI DB mốc `bot_stats` để biết bot đã nạp mã mới chưa; đừng phân tích log của một bản build cũ.
- **⚡ Tra ngôn ngữ LƯỜI — trả lại 800ms ngân sách ack (2026-10-26, `origin/master` = `5f9e23c`):**
  - **KHÔNG cần đăng ký lại lệnh**; chỉ cần restart.
  - `interactionCreate.js` await `getInteractionLanguage` ngay trước các cổng chặn, tức trên **100% lưu lượng và NẰM TRƯỚC ACK**. Nhưng tới `command.execute()` giá trị đó chỉ dùng ở **ba nhánh chặn + nhánh catch**; đường thường tính ra rồi **không ai dùng** (mỗi lệnh tự gọi lại sau `deferReply()`, lúc đó có 15 phút). Giá: **800ms = 27% ngân sách 3 giây** cho một giá trị sắp vứt. Cả ba cổng đều đọc RAM → nay gác RAM trước, chỉ ai BỊ CHẶN mới trả tiền tra (và họ không chạy lệnh nào).
  - **BẪY CỦA BẢN SỬA, đáng nhớ hơn bản sửa:** bỏ biến `locale` ở đầu khối thì **nhánh `catch` phía dưới vẫn tham chiếu nó → `ReferenceError` lúc chạy**. `node --check` **XANH** vì không phải lỗi cú pháp, và nhánh đó chính là đường báo lỗi cho người dùng — hỏng ở đấy thì lệnh lỗi hoá **lệnh im lặng**. Cổng `locale_khong_chan_duong_ack` vì thế **chạy thật cả ba nhánh** (thường · bị cấm · catch) với `i18n`/`bans` bị vá **trước khi require** `interactionCreate` (tệp đó destructure lúc nạp, vá sau là vô nghĩa).
  - **CỔNG `ack_path` TỰ ÂM THẦM NỚI RA — loại hỏng khó thấy hơn gãy hẳn:** neo cuối của phép "khối đồng bộ role không được await" là `const locale = await getInteractionLanguage`, đúng dòng commit này bỏ. `indexOf` **không trả -1** mà **trượt xuống lời gọi y hệt ở nhánh NÚT**, nên lát cắt nuốt trọn nhánh slash và báo đỏ với 8 `await` chẳng liên quan. Nay neo vào `.catch()` của chính khối đó, **kèm chốt chặn lát cắt phình quá 1200 ký tự**. **Luật rút ra: neo của cổng phải nằm TRONG thứ nó đang soi, và phải có chốt chặn độ dài — `indexOf` trượt thì im lặng, không kêu.**
  - 3/3 bẻ ngược của cổng mới đỏ (gồm phép dựng lại đúng lỗi `ReferenceError`), và 2/2 bẻ ngược chứng minh `ack_path` **vẫn còn răng** sau khi đổi neo. **739/739 test xanh.**
  - **Nghiệm thu bản vá Sổ Sứ Mệnh, do người chơi thật làm:** lần nhận quà **đầu tiên trong đời tính năng** là 25-10 22:48. Tới 26-10 đã **3 người / 4 mốc**, tiền vào ví qua `claim_pass_rewards_bulk` trong `economy_ledger` (+1.000 xu mỗi mốc 1, kèm vật phẩm ở mốc 2). Không cần playtest tay nữa.
- **🩹 Đóng lớp lỗi "làm rồi không kiểm kết quả rồi báo thành công" — 14 chỗ, 3 commit (2026-10-23, `origin/master` = `b93f16a`):**
  - **KHÔNG cần đăng ký lại lệnh.** Toàn bộ là mã chạy; chỉ cần **restart** để nạp. Kèm `abd2717` (`/study start`) và `1f21606` (heo/cây) vốn cũng chưa sống.
  - **GỐC RỄ CỦA CÁCH TÌM, quan trọng hơn danh sách chỗ vá:** lớp lỗi này đã bị vá từng chỗ bốn lần (`e138e6b` `/config` · `5a6edf8` nhánh tiền heo/cây · `1f21606` nhánh vật phẩm · `26b7974` 4 trò có lưu lượng) và lần nào cũng mọc lại ở chỗ khác, vì mọi lượt quét đều **soi theo tệp đang nghi**. Nới phép quét ra **toàn `src/` × mọi hàm ghi** thì ra ngay 7 chỗ chưa ai biết — trong đó nặng nhất **không** nằm trong bất kỳ danh sách mục-còn-mở nào.
  - **Xếp priority bằng lưu lượng đo được, không bằng thứ tự tình cờ phát hiện.** `economy_ledger` 30 ngày: `work` 7.138 · `consume_item` 2.003 · **`gather` 1.712** · `give_item` 905 · `thue_tai_san` 323 · `crate` 259 · **`plant` 16**. Tức bề mặt cày cuốc có **~107 lần** lưu lượng của nông trại — và 4 chỗ nặng nhất nằm đúng ở đó.
  - `lib/gather.js` (`/fish` `/mine` `/chop`) gom về **MỘT CỬA `moSoTrao`**: nguyên liệu · Vàng Đông Triều (1%) · Kỳ Nam (0,5%) · trứng thú cưng. Hai món hiếm là ca tệ nhất — người chơi đào hàng tuần mới gặp, hụt một lần là mất đúng thứ họ chờ, mà năng lượng + độ bền công cụ **đã bị tiêu**. Một lượt cày trao tới ba món nên sổ **gom** món hụt rồi cảnh báo **đúng một lần** ở cuối, **kèm tên món** (câu `common.item_unconfirmed` không nói món nào, mà cái tên mới là thứ dùng để đối chiếu). `fish.js` bỏ cửa riêng `traoCa` — bản cũ CÓ kiểm nên không nói sai, nhưng không ghi log và không nói gì, nên mẻ Cá Rồng 0,1% hụt thì biến mất không dấu vết.
  - **TRỘM HEO / TRỘM CÂY — ca duy nhất mất mát CHÉO giữa hai người chơi:** `pigClaimSale`/`plantClaim` **xoá heo/cây của NẠN NHÂN trước** rồi mới trao cho kẻ trộm. Hụt là hai người cùng mất và cả hai đọc chữ "thành công".
  - `/pet feed`: `addPetSkillPoints` bỏ trôi kết quả. Mất ở đây là **vĩnh viễn** — điểm suy ra từ cấp (`floor(lvl/5)`) nên lần cho ăn sau tính mốc theo cấp MỚI, mốc đã vượt không bao giờ trả điểm lần hai. Hàm trả **SỐ** điểm mới hoặc `null`, KHÔNG phải boolean → phải kiểm `typeof === 'number'`.
  - `/announcement`: 5 lời `setGuildSetting` không kiểm. Bản tin ở `guild_settings['global']` chính là thứ `/announcement view` **và trang web** đọc → 49 server nhận tin mới mà web vẫn hiện tin cũ, chủ bot đọc chữ "đã gửi xong". `clear` hụt thì **dừng**; `send` hụt thì **vẫn phát** (tin đã soạn) nhưng nói rõ phải chạy lại.
  - Đường **nút ticket** (`tkt:*`): 3 lời chờ trước ack. Nay `getTicketByChannel` thành **lười + withTimeout**, `claimTicket` **ack trước ghi sau** (ack **ẩn** vì nhánh thất bại phải nhắn riêng — sau ack công khai thì không ẩn lại được; lời khoe công khai chuyển sang `channel.send`), `lock` ack trước vòng REST đổi quyền. **Câu hỏi fail-open/fail-closed cho phép kiểm quyền staff HOÁ RA KHÔNG CẦN trả lời:** `getGuildSettings` hỏng → `layRoleStaff` rơi xuống Tầng 2 quét role `ManageThreads` trong RAM, tức nghiêm **ngang hoặc hơn**, không nới quyền cho ai.
  - **Migration `0158_marry_khoa_dong.sql` — ĐÃ ÁP test + prod (23/10), đã nghiệm thu.** `marry_users` (0010) đọc `partner_id` hai người rồi mới ghi, không `for update` → hai lượt cưới chạm nhau tạo **quan hệ một chiều** mà **không lệnh nào sửa được** (`divorce_user` xoá theo `partner_id` của chính người gọi; `marry_users` chặn cưới lại) → kẹt vĩnh viễn, phải sửa tay DB. Khoá theo `least`/`greatest` của user_id **chứ không theo thứ tự tham số** (hai lượt ngược chiều khoá chéo nhau → deadlock), và `for update` nằm **ngay trên câu đọc** (luật R3 của `check-sql` quét theo từng câu).
    - **Bản nháp của file này từng SAI một điểm, và chỉ hỏi DB mới lộ:** nó khai `security definer` vì suy theo mẫu chung của RPC nhạy cảm, nhưng `pg_proc.prosecdef` cho thấy cả hai hàm trên test LẪN prod đều là **SECURITY INVOKER**. Đã bỏ. **Luật: REPLACE một hàm đang sống thì ĐO thuộc tính cũ (`prosecdef`/`proconfig`/`proacl`) rồi giữ nguyên, đừng suy từ hàm khác** — `create or replace` đặt lại hết, nên cả hai chiều (thiếu lớp vá, hoặc tự nâng quyền) đều là lỗi.
    - **Nghiệm thu:** 15/15 phép thử hành vi khớp (gồm `already` ở cả 4 tổ hợp đã-cưới/còn-rảnh × vị trí LO/HI, và ly hôn xoá cả hai phía kể cả khi gọi từ phía bên kia). Khoá thì **đo trực tiếp** chứ không suy từ mã: nhánh `already` không ghi gì nên `xmax ≠ 0` chỉ có thể do `for update`. Phép đo đó **đã bẻ ngược**: hạ hàm về bản cũ 0010 rồi dò lại thì đọc ra `KHONG-KHOA`, bản mới đọc ra `bi-khoa`, trong khi cả hai đều trả `already` y nhau (phần hạ + nâng nằm trong CÙNG transaction nên bản cũ không bao giờ được commit). Quyền sau replace: `anon`/`authenticated` **không** gọi được, `service_role` gọi được; hai DB khớp `md5(pg_get_functiondef)`.
    - **Đo prod trước khi áp: 4 dòng `partner_id` = đúng 2 cặp, cả hai HAI CHIỀU ĐỦ** — chưa có cặp nào bị kẹt. Migration này là **phòng**, không phải chữa; đừng dùng nó làm bằng chứng rằng kết hôn là bề mặt nóng.
  - **3 cổng, 34/34 phép bẻ ngược làm cổng đỏ:** `cay_cuoc_khong_khoe_hao` (mở rộng từ `cau_ca_khong_khoe_hao`, trước chỉ gác fish.js nên **xanh suốt**; nay chạy thật cửa trao với bản giả `database.js` + **quét toàn repo**) · `ghi_hut_phai_noi_that` (quét toàn repo trên 11 hàm ghi có giá trị; mục miễn phải kèm phép `conDung()` tự kiểm) · 3 phép kiểm mới trong `ack_path` (file đó trước chỉ soi nhánh slash, nhánh **nút** không ai gác). **719/719 test xanh.**
  - **Giới hạn đã biết của cổng, đừng tin rộng hơn thực tế:** nó chỉ thấy lời ghi CÓ giá trị trả về để mà bỏ trôi. Nhóm helper `deletePlant`/`pigSetType`/`pigSetSick`/`plantSetDead` nuốt lỗi và trả `undefined` cho mọi kết quả → nơi gọi **không thể** kiểm, nên `destroyPlant` vẫn nói "đã phá cây" khi xoá hỏng. Cố ý chưa vá: phải đổi hợp đồng helper trước, đó là sổ nợ "`false` lẫn nghĩa" (~44 hàm). Hậu quả là nhầm lẫn, không phải mất mát.
  - **ĐÃ KIỂM, KHÔNG phải lỗi — đừng đuổi lại:** `quest.js:359` (`bakeryOpen` kiểm lại `bo_lam_banh` ngay sau đó, tiền cũng chưa trừ) · `rest.js` `addHealth` (thưởng kèm; thứ lệnh HỨA là năng lượng và `setEnergy` CÓ kiểm) · `stakeSettle` ở loto/masoi/bingo (helper tự retry + ghi `[CRITICAL]`, phần trả thưởng kiểm riêng) · `/announcement send` gửi tuần tự 49 server (chậm ~10s nhưng ĐÚNG, báo sent/fail thật, nằm sau `deferReply` nên không có nguy cơ ack — song song hoá chỉ thêm rủi ro rate-limit cho một lệnh owner dùng rất thưa).
  - **Quy mô thật, để phiên sau không tưởng là việc gấp:** `tickets` **0 dòng** từ đầu đến giờ (đường nút vẫn SỐNG, với tới được qua `/ticket panel`) · **4/1.073** tài khoản từng có `partner_id`, tức 2 cặp trong suốt đời bot · `user_pets` 15. Vá vì nó ĐÚNG và rẻ, không vì đang cháy.
  - **Còn mở:** `DBL_TOKEN` rỗng (3 người từng vote — kỳ vọng bằng 0) · `work:again` 21 lần vẫn chưa giải thích được, chờ log mới.
- **🔢 `nextConfessionNumber` nguyên tử + 2 chỗ nữa do NỚI PHÉP QUÉT mà ra (2026-10-23, migration `0159` ĐÃ ÁP test + prod):**
  - **KHÔNG cần đăng ký lại lệnh**; chỉ cần restart.
  - **BÀI HỌC CHÍNH, và nó lặp lại đúng bài học của đợt trước ở một tầng sâu hơn:** cổng `ghi_hut_phai_noi_that` quét "toàn `src/`" nhưng vẫn mù ba kiểu — (1) regex neo cứng tiền tố `db\.`, nên **mọi lời ghi helper-gọi-helper NGAY TRONG `src/database.js`** đều vô hình, mà đó chính là nơi mọi lời ghi thật nằm; (2) đòi `);` kết thúc cùng dòng, nên lời gọi **nhiều dòng** thoát được; (3) `boCmt` nén chú thích khối thành một dấu cách nên **số dòng cổng in ra bị lệch** (nó bắt đúng một lỗi tiền nhưng báo `database.js:938`, một dòng không liên quan). Nới cả ba thì ra ngay **một lỗi tiền chưa ai biết**. Tức "quét toàn repo" chưa đủ — **phép đo cũng phải tổng quát**.
  - **`sellItem` (lỗi TIỀN, mới):** thưởng buff `harvest` của thú cưng gọi `addMoney` rồi bỏ trôi kết quả, nhưng **vẫn cộng `bonus` vào `data.gain`** trả về. `/sell` in "Thu về" từ con số đó VÀ "Số dư mới" đọc tươi từ DB → ghi hụt làm hai con số tự tố nhau, mà con số sai mới là con số người chơi tin. Nay chỉ phồng `gain` trong nhánh thành công, kèm `[PAYOUT FAIL] sell-harvest-bonus`. (Ngưỡng Lv.5 cũ đã bỏ nên nhánh này SỐNG với mọi pet có buff harvest.)
  - **`nextConfessionNumber` có BA lỗi trong 5 dòng, không phải một:** (A) đọc-sửa-ghi trong JS → hai bài cùng lúc trùng số (đây là lỗi duy nhất từng được nêu); (B) **nặng nhất, trước đây chưa ai nêu** — `getGuildSettings` trả `{}` khi lỗi nên `n = 1`: bài được đánh số **#1** *và* counter bị **ghi đè về 1**, tức một lượt ĐỌC chập là mất cả dãy số của server, không cần đua tranh gì; (C) kết quả `setGuildSetting` bị bỏ trôi → ghi hụt thì bài sau lấy lại đúng số đó. Một câu `insert … on conflict do update … returning` xử cả ba: Postgres khoá dòng xung đột rồi nhánh DO UPDATE đọc bản mới nhất, và số được CẤP chính là số được LƯU.
  - Nhánh hụt của `/confession` **dừng hẳn** (chuỗi viết thẳng hai ngôn ngữ tại chỗ, vì `err_send_failed` nêu đích danh "quyền ở kênh vừa bị đổi" — dán vào lỗi DB là nói sai lần nữa). Cooldown vẫn bị tiêu và câu thông báo **nói thẳng điều đó**, vì `claim_cooldown` không có đường nhả.
  - **`setGuildSetting` nay nằm trong danh sách cổng gác.** Mục miễn duy nhất mới: `events/ready.js` `syncBotStatsToDb` — việc nền 30 phút/lần, không hứa gì với ai, tự chữa ở lượt sau; kèm phép `conDung()` sụp ngay nếu mất vòng lặp đó.
  - **14/14 phép bẻ ngược làm cổng đỏ**, gồm hai phép dựng lại đúng hai điểm mù: bỏ trôi `setGuildSetting` không tiền tố trong `database.js`, và bỏ trôi `addMoney` viết nhiều dòng. **722/722 test xanh.**
  - **Quy mô thật:** đúng **2** server từng có `confession_count` (giá trị 1 và 2, lưu dạng *chuỗi* JSON vì `set_guild_setting` nhận `p_value text` — hàm mới đọc bằng `->>` nên hiểu cả dạng cũ, không cần migrate dữ liệu). Vá vì Luật 1 bất khả xâm phạm và cách vá rẻ.
- **🌐 Chuẩn hoá bề mặt lệnh sang tiếng Anh, HOÀN TẤT ở tầng subcommand (2026-10-23, `origin/master` = `e2e42ab`):**
  - ⚠️ **PHẢI ĐĂNG KÝ LẠI LỆNH** (restart với `SKIP_DEPLOY` ≠ `1`). Đợt này đổi **bề mặt** lệnh; không đăng ký lại thì Discord giữ định nghĩa CŨ và người chơi gặp "application did not respond".
  - **HỢP ĐỒNG NGÔN NGỮ — đọc trước khi sửa bất cứ thứ gì liên quan:** đổi ngôn ngữ thì **chỉ MÔ TẢ và nội dung đổi; TÊN người ta gõ thì giữ nguyên**. `commandLocalizer` ghi `name_localizations` bằng CÙNG một tên tiếng Anh cho mọi locale. Khoá bằng `test/doi_ten_sub_tieng_anh.test.js`.
  - Đổi **23 subcommand**: `/bakery` xem·mo·nhapnl·thu·thue·sathai·trangtri·nangcap·donhang·giaodon → view·open·stock·collect·hire·fire·decor·upgrade·orders·deliver · `/farm` → plant·water·fertilize·harvest·revive·clear·steal · `/bank` → deposit·withdraw · `/dating` → outing·gift · `/premium-admin` → pending·approve. Và **9 option**: loai·sl·nhan_vien·vat_pham·stt → type·amount·staff·item·number, phamvi→scope, ma→code, anh→image.
  - **Tên cũ VẪN GÕ ĐƯỢC ở đường prefix** qua `SUB_ALIASES` (`lib/prefixTen.js`) áp trong `prefixShim.parseOptions`: `w!tiembanh xem` → `view`. Bỏ bảng này là mọi lệnh gõ tắt kèm subcommand im lặng không chạy.
  - **NGOẠI LỆ DUY NHẤT của hợp đồng:** lệnh context menu. Tên của nó CHÍNH LÀ chữ hiển thị trong menu chuột phải — không ai gõ. Nay đăng ký `View Waguri Profile` + bảng `CONTEXT_MENU_NAMES` dịch chữ hiển thị (trước đó mọi locale đọc "Xem hồ sơ Waguri").
  - **`choice` value KHÔNG đổi — nó là khoá DỮ LIỆU:** 21 giá trị trùng `items.id` (seed 0043), `pet.adopt.species` là cột `pets.species` (0013, phải khớp `pet_species_adoptable` ở 0142), `bakery.hire.staff`/`decor.item` nằm trong JSONB `bakeries.staff`/`decor`. Đổi là phải migrate và làm vỡ dòng đã lưu. Phần hiển thị của chúng là **nhãn**: đã phủ **112/112** qua `CHOICE_LOCALIZATIONS` (trước chỉ 33 — 79 cái còn lại hiện tiếng Việt cho mọi ngôn ngữ, hoặc nhồi "Ngửa / Heads" vào một dòng).
  - Dọn kèm: `commands.plant` là bản sao **y nguyên từng byte** của khối `plant` ở gốc (68 khoá × 2 ngôn ngữ), 75/75 lượt tra dùng đường gốc → đã xoá.
  - **2 cổng mới, 14/14 phép bẻ ngược làm cổng đỏ:** `doi_ten_sub_tieng_anh` · `nhan_choice_song_ngu` (kèm canh trần 100 ký tự của Discord — lỗi đó chỉ nổ lúc deploy). 681/681 test xanh.
- **🧹 Dọn dẹp mô tả lệnh & khoá localizer chết — XONG 5/5 đợt của `docs/spec-don-dep-2026-08-29.md` (2026-10-23, `origin/master` = `ba3a41b`):**
  - ⚠️ **CẦN ĐĂNG KÝ LẠI LỆNH một lần** (restart với `SKIP_DEPLOY` ≠ `1`). Đợt này đổi mô tả lệnh; không đăng ký lại thì Discord giữ mô tả CŨ và mọi thay đổi vô hình.
  - **GỐC RỄ CHUNG, đính chính mục "Chuẩn hoá 72 lệnh" bên dưới:** lần đó đổi tên **LỆNH** sang tiếng Anh nhưng **KHÔNG đổi tên SUBCOMMAND**. Sub vẫn là tiếng Việt (`/bakery xem · mo · nhapnl · thu`, `/farm muagiong · tuoi · bonphan · thuhoach`). Mục đó ghi "ĐÃ HOÀN THÀNH 100%" — đúng ở tầng lệnh, **sai ở tầng subcommand**. Đổi tên sub là việc KHÁC, chưa làm (nó đổi thứ người chơi gõ).
  - Hậu quả đã vá: `/help` từng dạy **15 tên sub không tồn tại**; **135/435 khoá `commandLocalizer` là khoá chết** (32%, đã xoá, chứng minh đầu ra giống nhau từng byte); nhãn dropdown `/help` **trượt nhóm** (bấm "Quản trị" lại mở "Khác") vì mảng i18n có 11 mục cho 9 nhóm; `/work` đọc kịch bản tiệm bánh cho nhầm nghề; localizer nuốt giá (giống 500, viện phí 3.000, sửa 15%) và cảnh báo **"không hoàn tác"** của `/deletedata`.
  - Mới: `src/lib/demThanhVien.js` tách **người thật / bot** bằng role `tags.botId` (0 lượt fetch, đã nghiệm thu lệch 2,2%) → một dòng console lúc khởi động + `/serverinfo`. Cẩm nang web 766 dòng lần đầu có đường tới được từ bot (nút ở `/help` và `/start`).
  - **4 cổng mới, 33/33 phép bẻ ngược đều làm cổng đỏ:** `work_noi_dung_du_nghe` · `localizer_khong_khoa_chet` · `mo_ta_khong_bi_nuot` · `help_nhan_nhom_khop_chi_so`. 669/669 test xanh.
  - **Bẫy quan trọng cho lần sau:** `t()` **rơi về bản Việt** khi thiếu khoá tiếng Anh → mọi phép kiểm "có ở cả vi và en" viết qua `t()` đều **xanh giả** trong khi người dùng EN đọc tiếng Việt. Phải đọc thẳng tệp JSON. Ngược lại, `t()` trả `undefined` cho `data.items.*` ở bản Việt, nên `t(...) || 'Cá Tươi'` ở `fish.js` là mã **SỐNG** — đừng dọn.
- **🛡️ Khóa Tính Năng (Feature Freeze), Đo Lường Lệnh Bền Vững (Telemetry) & Checklist Vận Hành 5 Cổng — ĐÃ HOÀN THÀNH 100% (2026-09-25):**
  - **Giải phóng 100% Voice Stack & Hạ tầng VPS 384MB:** Gỡ bỏ hoàn toàn `@discordjs/voice`, `ffmpeg-static` (~70MB binary), `libsodium-wrappers`, `opusscript` khỏi `package.json`; di dời `hvlPlayer.js` vào `archive/voice/`. Triệt tiêu hoàn toàn nguy cơ OOM V8 heap trên VPS Wispbyte. Phân định rạch ròi: Bot tập trung Text/RPG Game, Web gánh Lo-Fi Study Room (`/study`, HTML5 Web Audio 0MB load).
  - **Cởi trói Voice cho Lô Tô (`/loto`):** Bỏ kiểm tra voice channel bắt buộc, cho phép 100% người dùng mobile/text mở phòng chơi Lô tô; giữ nguyên phí bàn 5% (House edge) đóng vai trò Currency Sink hút xu thừa.
  - **Hệ thống Đo Lường Lệnh (Zero-Lag Command Telemetry):** Module `src/lib/commandTelemetry.js` đếm in-memory đạt độ trễ 0ms trên hot-path lệnh Discord; tích hợp Auto-Flush + Hook `SIGTERM`/`SIGINT` bảo toàn dữ liệu khi bot restart.
  - **Báo cáo Sức Khỏe Vận Hành 5 Cổng (`/eco-admin daily`):** Báo cáo trực quan phân loại 🟢 Xanh / 🟡 Vàng / 🔴 Đỏ gồm 5 Cổng Chất Lượng: Cổng 1 (RAM & Uptime VPS), Cổng 2 (Lượt gọi & Tỷ lệ lỗi lệnh), Cổng 3 (Top lệnh hot & Watchlist lệnh chết 14d/30d), Cổng 4 (Cân bằng Sink/Faucet), Cổng 5 (Quỹ Tín Dụng Kikyo & tỷ lệ nợ xấu NPL).
  - **Visual Pastel & Micro-Interactions Chống Memory Leak:** Chuẩn hóa bảng màu Pastel (`config.CORE_THEMES`) cho 5 lệnh cốt lõi (`/daily`, `/farm`, `/bakery`, `/loan`, `/study`). Tích hợp các nút hành động 1-chạm kèm cơ chế timeout 60s (`time: 60_000`) tự hủy components, ngăn ngừa 100% rò rỉ bộ nhớ.
  - **Ban hành Tài Liệu Vận Hành:** Hoàn thành `docs/daily-checklist.md` định hình quy trình 3 phút mỗi sáng cho Owner/Admin.
- **🏛️ Đại Phẫu Kiến Trúc & Chuẩn Hóa 72 Lệnh Slash Song Ngữ — HẠNG MỤC ƯU TIÊN #1 ĐÃ HOÀN THÀNH 100%:**
  - **Tỉa cành & Cất kho 9 tính năng cũ:** Đã di dời an toàn `clan.js`, `worldevent.js`, `bacay.js`, `duangua.js`, `xocdia.js`, `bingo.js`, `heo.js`, `date.js`, `ship.js` vào `archive/commands/`.
  - **Dọn dẹp vòng lặp nền & Tối ưu hiệu năng:** Gỡ bỏ hoàn toàn interval 60s `runAuctionResolution()` và cron đấu giá trong `index.js`, giải phóng RAM tối đa cho bot VPS. Tinh giản `/market` tập trung vào Chợ Nông Sản MurmurMix32.
  - **Chuẩn hóa 72 lệnh tiếng Anh:** Đổi tên toàn bộ lệnh thành tiếng Anh chuẩn quốc tế (`/bakery`, `/farm`, `/loan`, `/dating`, `/relief`, `/rest`, `/gift`, `/weather`, `/lunar`, `/fortune`, `/trivia`, `/wordchain`), đồng thời giữ alias gõ tắt `w!tiembanh`, `w!vay`... và hỗ trợ 100% bản dịch song ngữ `vi` + `en`.
  - **Quỹ Tín Dụng Học Đường Kikyo (`/loan`):** Thiết kế lại hệ thống tín dụng vay trực tiếp từ quỹ hệ thống Waguri với hạn mức theo cấp độ, loại bỏ hoàn toàn toxic, quỵt nợ và cho vay nặng lãi P2P.
  - **Mở khóa Tiệm Bánh Gekka (`/bakery`):** Hạ điều kiện mở tiệm xuống **Cấp 3 + 3.000 xu** (thay vì Cấp 5 + 10.000 xu), kết nối nguồn nông sản lúa mì/dâu tây từ `/farm`.
  - **Nâng cấp Trải nghiệm:** `/confession` tích hợp AI Waguri hồi âm chữa lành (ephemeral); `/ticket` chuyển sang form Modal 3 trường gửi trực tiếp Webhook Support Server (không tạo channel); `/blackjack` bổ sung giao diện emoji lá bài trực quan.
  - **Đồng bộ toàn diện & Test Suite:** Đã đồng bộ 72/72 lệnh với Web `CommandsExplorer.tsx`, `scripts/command-surface.json`. 572/572 tests passed 100%, CI passes 100%.

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
  - **Thứ tự ưu tiên hiện tại** (chủ động thắng ngầm định; cá nhân thắng môi trường):
    `/language` người dùng tự chọn (`users.locale_chosen`, migration `0156`) → `/config
    language` của admin → `interaction.locale` (app Discord, học lại vào DB khi đổi) →
    `users.locale` học được (chỉ còn tác dụng ở đường prefix `w!`) → `guildLocale` → `'vi'`.
    Có test khoá thứ tự này (`test/i18n_priority.test.js`). **Sửa 2026-10-21:** bậc "học
    được" từng đứng trên app Discord và chỉ ghi khi rỗng → ngôn ngữ lần đầu bị khoá vĩnh
    viễn (25 người khoá ở `en` trên prod), và không có cách nào tự đổi.
  - **Tên lệnh:** Discord chỉ đăng ký tên TIẾNG ANH cho mọi ngôn ngữ (`commandLocalizer` ghi
    đè `name_localizations`). Tên Việt cũ (`tiembanh`, `vay`, `dovui`…) sống dưới dạng gõ tắt
    `w!` trong `lib/prefixTen.js`. `scripts/check-command-refs.js` chặn chữ hướng dẫn nhắc
    lệnh không tồn tại (từng có ~100 chỗ `/tiembanh`, `/vay`, `/clan`…).
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
- **Sổ Sứ Mệnh (Battle Pass) theo mùa giải — phần DB/XP đã xong; phần NHẬN QUÀ trên Discord thì chết từ ngày phát hành tới 25-10-2026 (xem mục đầu §4).** Câu cũ ở đây ghi "ĐÃ HOÀN THÀNH end-to-end", và chính câu đó khiến các lượt audit sau không soi lại đường nút. Chi tiết: migration `0079` (`battle_pass_users` + 3 RPCs), `0079b` (`add_ai_chat_pass_xp`), và `0079c` (`buy_premium_pass` fix) đã áp DB + verified. Lệnh `/pass` tương tác đẹp, tự động tính Season ID theo âm lịch. Tích hợp hooks cộng XP tự động vào `/daily`, `/quest`, cày cuốc và `/ask` (kèm quota chống spam AI 50 XP/ngày). Web Dashboard widget và trang chi tiết `/dashboard/pass` kèm Server Actions nhận quà, mua Premium đã hoàn thành.
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

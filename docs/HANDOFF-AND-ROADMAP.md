# Waguri — Tài liệu bàn giao kỹ thuật & Lộ trình

> Mục đích: tài liệu này viết cho **AI agent / dev** tiếp nhận. Mỗi mục có đủ *vấn đề → cách làm → file liên quan → tiêu chí hoàn thành → công sức* để thực thi ngay.
> Bối cảnh: Discord bot economy/RPG VN. Bot Node.js (root, host Wispbyte/Pterodactyl), web Next.js (`web/`, Vercel), Supabase, Gemini. discord.js 14.26.4 · ws 8.21.0 · @discordjs/ws 1.2.3 · undici 6.24.1.

---

# PHẦN A — Lỗi WebSocket: "Opening handshake has timed out"

## A.1. Lỗi là gì
```
Error: Opening handshake has timed out
    at ClientRequest.<anonymous> (/home/container/node_modules/ws/lib/websocket.js:890:7)
    at TLSSocket.emitRequestTimeout (node:_http_client:961:9)
    ...
```
- `/home/container/` ⇒ chạy trong container **Pterodactyl/Wispbyte** (bot production).
- Bot kết nối **Discord Gateway** `wss://gateway.discord.gg` qua chuỗi `discord.js → @discordjs/ws → ws`. Kết nối WSS bắt đầu bằng một HTTP GET có header `Upgrade`. Lỗi này = **bước bắt tay mở WebSocket (TLS + HTTP upgrade) không hoàn tất trong thời gian timeout**.
- **KHÔNG phải bug thư viện.** Maintainer discord.js đóng issue trùng (#9571) là *invalid/not planned* — đây là vấn đề **môi trường/mạng của host**.

## A.2. Nguyên nhân gốc (xếp theo khả năng cho host Wispbyte free/giá rẻ)
1. **Mạng egress chập chờn / IP dùng chung bị bóp** — phổ biến nhất ở host free. Gói tin tới gateway Discord rớt/nghẽn.
2. **IPv6 hỏng/định tuyến sai** — Node ưu tiên IPv6 (AAAA); nếu host có IPv6 nhưng không route được tới Discord, kết nối **treo tới khi timeout** rồi mới (có thể) fallback IPv4.
3. **DNS chậm/không ổn định** trên container.
4. **Sự cố tạm thời phía Discord Gateway** (hiếm, transient).
5. **Event loop bị chặn** (CPU/RAM bị throttle, hoặc xử lý đồng bộ nặng) ⇒ callback bắt tay không kịp chạy ⇒ timeout.
6. **OOM/throttle**: container hết RAM bị kill, hoặc free tier "ngủ".

## A.3. Lỗ hổng trong code hiện tại (cần vá)
| Vị trí | Vấn đề |
|---|---|
| `index.js:131` `client.login(...)` | **Không có `.catch()` và không retry.** Nếu bắt tay timeout NGAY lúc đăng nhập → promise reject → chỉ rơi vào `unhandledRejection` (log) → **bot nằm im offline tới khi restart tay.** |
| `index.js` (toàn bộ) | **Thiếu listener** `error`, `shardError`, `shardDisconnect`, `shardReconnecting`, `invalidated` → không quan sát/không phản ứng vòng đời gateway. |
| Khởi động | **Không ép IPv4** ⇒ dính nguyên nhân (2). |
| `package.json` | **Không pin `engines.node`** ⇒ trôi phiên bản Node. |

> Lưu ý: discord.js **tự reconnect** cho kết nối ĐÃ thiết lập (resume/reconnect). Vấn đề chính là (a) **lần login đầu** thất bại không được retry, và (b) trạng thái "zombie" khi mất kết nối lâu mà không tự phục hồi.

## A.4. Spec sửa (ưu tiên P0 → P2)

### P0 — Ép IPv4 + Login có retry/backoff + Listener vòng đời
**File:** `index.js`

1) Đặt **DÒNG ĐẦU TIÊN** của `index.js` (trước mọi require khác):
```js
require('node:dns').setDefaultResultOrder('ipv4first'); // tránh treo bắt tay do IPv6 hỏng trên host
```
*(Hoặc đặt env trên Wispbyte: `NODE_OPTIONS=--dns-result-order=ipv4first` — chọn 1 trong 2.)*

2) Thay `client.login(process.env.DISCORD_TOKEN);` (cuối file) bằng:
```js
// Login có retry/backoff — chịu được bắt tay timeout lúc khởi động
async function startBot() {
  let attempt = 0;
  for (;;) {
    try {
      await client.login(process.env.DISCORD_TOKEN);
      return; // thành công — discord.js tự lo reconnect về sau
    } catch (err) {
      attempt++;
      const wait = Math.min(5000 * 2 ** (attempt - 1), 60000); // 5s,10s,20s,...,tối đa 60s
      logError('login_retry', err, { attempt });
      console.error(`[GATEWAY] Login lỗi (lần ${attempt}): ${err?.message}. Thử lại sau ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// Vòng đời gateway
client.on('error', (e) => logError('client_error', e));
client.on('shardError', (e, id) => logError('shard_error', e, { shard: id }));
client.on('shardDisconnect', (ev, id) => console.warn(`[GATEWAY] Shard ${id} ngắt (code ${ev?.code}) — sẽ tự kết nối lại...`));
client.on('shardReconnecting', (id) => console.log(`[GATEWAY] Shard ${id} đang kết nối lại...`));
client.on('invalidated', () => {
  logError('session_invalidated', new Error('Session invalidated'));
  console.error('[GATEWAY] Session bị vô hiệu hoá — thoát để panel khởi động lại.');
  process.exit(1); // Pterodactyl/Wispbyte tự restart sạch
});

startBot();
```

**Tiêu chí hoàn thành:** mô phỏng login thất bại (vd đổi token sai tạm thời / chặn mạng) → log hiện "thử lại sau Ns" và **bot tự lên khi mạng ổn**, không còn `unhandledRejection` từ login.

### P1 — Watchdog chống "zombie disconnect"
**File:** `index.js`
```js
// Nếu gateway không Ready quá 5 phút -> thoát để panel restart sạch
let lastReady = Date.now();
client.on('ready', () => { lastReady = Date.now(); });
client.on('shardReady', () => { lastReady = Date.now(); });
setInterval(() => {
  const ready = client.ws?.status === 0; // 0 = Ready
  if (!ready && Date.now() - lastReady > 5 * 60_000) {
    console.error('[WATCHDOG] Gateway không Ready > 5 phút — thoát để restart.');
    process.exit(1);
  }
}, 60_000).unref();
```
**Tiêu chí:** khi mất kết nối kéo dài, tiến trình tự thoát (≤6 phút) và panel khởi động lại.

### P1 — Cấu hình host (Wispbyte/Pterodactyl) — KHÔNG phải code
- Bật **Auto Restart / crash detection** để `process.exit(1)` ⇒ panel restart.
- Đặt **Node 20 hoặc 22** (pin `engines.node: ">=20"` trong `package.json`).
- Kiểm tra **RAM limit**: nếu hay bị kill, tăng RAM (OOM cũng gây timeout).
- Nếu vẫn dày đặc: cân nhắc đổi host/region ổn định hơn hoặc dùng IP riêng.

### P2 — Health/monitoring & cảnh báo
**File:** `src/lib/voteServer.js` (đã có `/stats` + health)
- Thêm vào health endpoint: `gateway: client.ws?.status`, `ping: client.ws?.ping`, `uptime`.
- Gắn **UptimeRobot/BetterStack** ping endpoint health mỗi 1–5 phút → cảnh báo khi bot chết.
**Tiêu chí:** có cảnh báo (Discord/Telegram) trong ≤5 phút khi bot offline.

## A.5. Nguồn tham khảo
- discord.js issue #9571 — "Opening handshake has timed out" (đóng *invalid*, xác nhận do môi trường): https://github.com/discordjs/discord.js/issues/9571
- @discordjs/ws #9103 — crash khi reconnect do điều kiện mạng bất thường: https://github.com/discordjs/discord.js/issues/9103
- discord.js #7964 / #8199 — "WebSocket closed before connection established" khi mạng rớt: https://github.com/discordjs/discord.js/issues/7964
- AnswerOverflow — "Opening handshake timed out": https://www.answeroverflow.com/m/1209411259402031124
- Cách xử lý WebSocket connection timeout (tổng quát): https://oneuptime.com/blog/post/2026-01-24-websocket-connection-timeout/view

---

# PHẦN B — Backlog & Lộ trình (spec sẵn-sàng-thực-thi)

Ưu tiên: **P0** = nên làm sớm/độ rủi ro · **P1** = giá trị cao · **P2** = nice-to-have.

## B.1. Độ tin cậy & Vận hành
| # | Hạng mục | P | Tóm tắt spec |
|---|---|---|---|
| 1 | **Vá WebSocket** | P0 | Theo PHẦN A. File: `index.js`. |
| 2 | **Integration test luồng tiền** | P0 | Hiện test chỉ phủ hàm thuần; **0 test cho transfer/buy/gambling**. Thêm test gọi RPC trên một Supabase test (hoặc mock) cho: `transfer_money_with_tax`, `buy_item`, `claim_daily`, gambling trừ-rồi-cộng. File: `test/economy.integration.test.js`. *Tiêu chí:* CI chạy được không cần secret thật (dùng project test riêng / container). |
| 3 | **`database.js` không `process.exit(1)` khi thiếu env** | P1 | `src/database.js:9-10` exit cứng làm module khó test + dễ chết. Đổi sang throw có kiểm soát / cảnh báo, để caller quyết định. *Tiêu chí:* require module không kill tiến trình test. |
| 4 | **Backup DB định kỳ + kiểm thử restore** | P1 | `scripts/backup-db.js` — xác nhận chạy theo lịch (cron/`BACKUP_CHANNEL_ID`), thử **restore** thật 1 lần để chắc backup dùng được. |
| 5 | **Logging có cấp độ + chống spam** | P2 | `src/lib/logger.js` — thêm severity, gộp/giới hạn log lặp (vd gateway reconnect) để không flood webhook. |

## B.2. Tính năng Bot
| # | Hạng mục | P | Tóm tắt spec |
|---|---|---|---|
| 1 | **guildMemberAdd: cấu hình theo server** | P1 | Hiện chỉ chào ở support guild (hardcode `SUPPORT_GUILD_ID`). Mở rộng: thêm option vào `/config` để mỗi server tự đặt **welcome channel** + **auto-role**; đọc qua `getGuildSetting(guild.id, 'welcome_channel'|'welcome_role')`. File: `src/events/guildMemberAdd.js`, `src/commands/admin/config.js`, migration thêm key. *Tiêu chí:* server bật/tắt + chọn kênh/role được; mặc định TẮT (không spam). |
| 2 | **Nâng cấp /ticket** | P1 | `/ticket` hiện dùng collector in-memory → **mất khi bot restart**. Nâng: lưu ticket vào DB (`tickets` table), nút đóng xử lý ở `interactionCreate` (global handler, không phụ thuộc collector), **transcript** khi đóng, **staff claim**, phân loại (bug/premium/khác). File: `src/commands/utility/ticket.js`, `src/events/interactionCreate.js`, migration. |
| 3 | **Tự động hoá sự kiện theo mùa** | P1 | Đã có item theo mùa (bánh chưng/trung thu) + `game_event`. Thêm **scheduler** tự bật sự kiện x2/giảm giá theo lịch (Tết, Trung thu, cuối tuần). File: `src/lib/event.js`, cron nội bộ. |
| 4 | **Thưởng theo cấp / role reward** | P2 | Khi lên cấp → tự gán role theo mốc (cấu hình per-guild). Tăng gắn kết. |
| 5 | **Mở rộng achievements + UI** | P2 | Thêm thành tựu mới + lệnh xem tiến độ đẹp hơn (đã có `/achievements`). |
| 6 | **Chợ/đấu giá nâng cao** | P2 | Thêm đấu giá theo thời gian, lịch sử giá, lọc/tìm trong `/market`. |

## B.3. Web (Next.js)
| # | Hạng mục | P | Tóm tắt spec |
|---|---|---|---|
| 1 | **Testimonials thật + badge Top.gg** | P1 | Khung đã có (`web/src/components/Testimonials.tsx`, mảng `TESTIMONIALS` đang rỗng = trạng thái mời đánh giá). Khi có review: (a) đổ review thật vào mảng, hoặc (b) fetch review Top.gg qua API. Thêm **widget vote/badge Top.gg** khi đã có vote (>0). |
| 2 | **Trang Changelog/Roadmap** | P1 | Mirror changelog của bot lên web (`/changelog`). Nguồn: 1 file MD hoặc bảng Supabase. Tăng niềm tin + SEO. |
| 3 | **Nội dung SEO tiếng Việt** | P2 | Trang guide/blog nhắm từ khoá ("bot discord kinh tế tiếng việt", "bot game discord"). Tăng organic. |
| 4 | **Tối ưu ảnh** | P2 | 3 cảnh báo `<img>` còn lại (DiscordMockup, avatar) → cân nhắc `next/image` hoặc loader; hiện chấp nhận được. |
| 5 | **Trang trạng thái (status page)** | P2 | Hiển thị uptime/ping bot công khai (lấy từ health endpoint A.4-P2). |

## B.4. Discord Server hỗ trợ (chủ yếu thao tác tay / 1 phần script hoá)
| # | Hạng mục | P | Tóm tắt |
|---|---|---|---|
| 1 | **Onboarding + Membership Screening** | P1 | Cấu hình tay theo phần script đã dặn (kênh mặc định, câu hỏi "Nhận thông báo nào"). |
| 2 | **Invite vĩnh viễn + webhook #logs** | P1 | Tạo invite không hết hạn → cập nhật `SUPPORT_INVITE`; webhook #logs → `LOG_WEBHOOK_URL`. |
| 3 | **Reaction roles / self-roles** | P2 | Cho thành viên tự chọn role thông báo. |
| 4 | **Auto-moderation** | P2 | Lọc spam/link, slowmode kênh chat. |

## B.5. Tăng trưởng & Doanh thu
| # | Hạng mục | P | Tóm tắt |
|---|---|---|---|
| 1 | **Vòng lặp vote Top.gg** | P1 | Đã có thưởng vote — đẩy mạnh CTA vote (web + bot) để leo bảng Top.gg → traffic. |
| 2 | **Tặng Premium / quà tặng** | P2 | Cho phép mua Premium tặng người khác (gift code). |
| 3 | **Referral** | P2 | Thưởng khi mời bạn vào chơi / mời bot về server mới. |

---

## Phụ lục — Bối cảnh kỹ thuật nhanh (cho agent mới)
- **Atomicity tiền:** mọi thao tác tiền/vật phẩm qua **RPC PostgreSQL** (`src/database.js` → `supabase/migrations/`). KHÔNG đọc-sửa-ghi ở JS. Tiền lưu `bigint`.
- **Bảo mật DB:** RLS đã bật; RPC premium đã revoke khỏi anon; search_path đã pin (migrations 0054/0055). Đừng nới lại.
- **Web ↔ bot:** web gọi API bot tại `https://waguribot.wispbyte.app` (`/api/*`, `/stats`). Web đọc/ghi Supabase qua **service-role admin client**; anon chỉ dùng cho auth.
- **CI:** `.github/workflows/ci.yml` — bot test (env dummy) + check-command-sync + web build + lint. Giữ xanh.
- **Đồng bộ lệnh:** `scripts/check-command-sync.js` đảm bảo mọi lệnh bot có trên web. Thêm lệnh mới → nhớ thêm vào `web/src/components/CommandsExplorer.tsx`.

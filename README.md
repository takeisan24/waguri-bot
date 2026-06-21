# 🌸 Waguri — Discord Economy / RPG / Community Bot (Vietnamese)

[![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2.svg)](https://discord.js.org)
[![Supabase](https://img.shields.io/badge/Database-Supabase%20%2F%20Postgres-3ECF8E.svg)](https://supabase.com)
[![Node](https://img.shields.io/badge/Node.js-%E2%89%A520-339933.svg)](https://nodejs.org)

**Waguri** là một Discord bot **kinh tế · nhập vai · cộng đồng** bản địa hoá đậm chất Việt Nam, kèm
**AI trò chuyện** mang persona dịu dàng, lễ phép, hay động viên (lấy cảm hứng từ nhân vật **Waguri Kaoruko**).
Từ nghề vỉa hè (nhặt ve chai, bán trà đá) leo lên đại gia, lập bang hội, chơi Loto/Bingo trong voice,
chơi minigame nhiều người, kết đôi, buôn bán… — tất cả bằng tiếng Việt.

> **Vòng lặp lõi:** Làm việc → kiếm VNĐ → mua sắm / chế đồ / lên cấp → mở nghề xịn → flex trên bảng xếp hạng.
> Cân bằng **hardcore** (năng lượng, mệt mỏi, sinh tử) nhưng **chống lạm phát** bằng nhiều tầng sink.

---

## ✨ Tính năng (77 lệnh)

| Nhóm | Lệnh tiêu biểu |
|---|---|
| 💼 **Kiếm tiền** | `/work` `/fish` `/mine` `/chop` `/daily` `/quest` `/jobs` — năng lượng + mệt mỏi + lên cấp + nghề |
| 🏪 **Cửa hàng & Kho** | `/shop` `/buy` `/sell` `/inventory` `/eat` `/ngu` `/cosmetic` `/craft` — chế tạo từ gỗ/quặng |
| 💸 **Tiền & Nợ** | `/balance` `/deposit` `/withdraw` `/give` `/rob` · vay nợ P2P `/vay` `/trano` `/donno` `/no` |
| 🎲 **Minigame** | `/coinflip` `/taixiu` `/baucua` `/blackjack` `/crate` |
| 👥 **Game nhiều người** | `/bacay` `/bingo` `/loto` `/masoi` (Ma Sói) `/xocdia` `/duangua` (đua ngựa) `/dovui` (đố vui) |
| 💞 **Cộng đồng** | `/marry` `/hug` `/kiss` `/date` `/divorce` `/relationship` `/lixi` `/confession` `/noitu` `/ship` `/boi` |
| 🏰 **Bang hội** | `/clan create·join·info·list·deposit·withdraw·kick·disband·war` (chiến tranh bang PvP) |
| 🛒 **Chợ** | `/market view·mine·sell·buy·cancel` — mua bán đồ giữa người chơi (ký gửi) |
| 💬 **AI & Premium** | `/ask` + @tag Waguri trò chuyện · `/premium` (quota AI cao + 10% thu nhập) · `/status` |
| 🏆 **Khác** | `/leaderboard` (tài sản / cấp / tình cảm) · `/achievements` · `/event` · `/invite` · `/help` |
| ⚙️ **Quản trị** | `/setup` (tạo phòng + cấu hình) · `/config` (AI toggle/kênh) · `/eco-admin` (owner: tiền/ban/premium) |

**Hệ thống nền:** năng lượng & hồi lười (lazy regen) · mệt mỏi giảm thu nhập · sức khỏe & nhập viện ·
xe cộ tiết kiệm năng lượng · độ bền & sửa công cụ · bảo hiểm · thú cưng · **chống lạm phát**
(thuế tài sản, lãi bank có cap, sink đa tầng) · **chống lạm dụng** (rate-limit, ban, công an cờ bạc) ·
**sự kiện x2** toàn cục · **graceful shutdown**.

---

## 🧠 Kiến trúc

- **discord.js v14** — Slash **và** prefix (`w!`) song song qua `prefixShim`; tương tác bằng button/select/collector.
- **Atomic-first**: mọi thao tác tiền/EXP/kho/quỹ chạy bằng **RPC PostgreSQL nguyên tử** (chống dupe & race).
- **Config tập trung** ở `src/config/index.js` — tinh chỉnh toàn bộ cân bằng game tại 1 chỗ.
- **AI Gemini** — persona Waguri trò chuyện qua Google Gemini (free tier); quota theo ngày (free/premium).
- **Embed chuẩn hoá** qua `src/lib/embed.js` (`buildWaguriEmbed`): màu theo trạng thái + ảnh/GIF Waguri + footer cá tính.
- **Logic thuần tách riêng** (leveling, fatigue, ma sói engine…) → có **unit test** (`node --test`).

```text
waguri/
├── index.js                  # Nạp lệnh + đăng ký slash + nạp event + ban + scheduler
├── src/
│   ├── config/index.js       # ⚙️ Toàn bộ hằng số cân bằng + WAGURI_IMAGES
│   ├── database.js           # Helper Supabase (gọi RPC)
│   ├── lib/                  # embed, leveling, fatigue, lobby, couple, loto, bingoPrefix, masoi/engine, ...
│   ├── commands/{economy,games,fun,utility,admin}/*.js
│   └── events/{ready,interactionCreate,messageCreate,guildCreate}.js
├── supabase/migrations/      # 0001 → 0045 (schema + RPC; đã áp qua Supabase)
└── test/*.test.js            # Unit test (leveling, fatigue, amount, masoi, sprint3)
```

---

## 🚀 Cài đặt & chạy

### 1) Discord Developer Portal
1. [Tạo Application](https://discord.com/developers/applications) → tab **Bot** → **Reset Token** (= `DISCORD_TOKEN`).
2. **Bật Privileged Intent: `MESSAGE CONTENT`** *(bắt buộc — dùng cho lệnh prefix `w!` & trò chuyện khi @tag)*.
3. Mời bot bằng `/invite` (link tự sinh, kèm sẵn quyền). Quyền cần: gửi tin/embed, **Quản lý Kênh** + **Quản lý Vai trò** (cho `/setup`), **Moderate Members** (tạm giam khi bị công an bắt).

### 2) Biến môi trường (`.env`)
| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Token bot |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | ✅ | Từ Supabase Project Settings |
| `GEMINI_API_KEY` *(hoặc key provider AI)* | ✅* | Cho `/ask` & @tag (quota free 15/ngày) |
| `OWNER_IDS` | ❌ | **Tuỳ chọn** — chủ app **tự nhận** là owner; chỉ thêm khi muốn cấp quyền cho người khác |
| `CLIENT_ID` | ❌ | Tự suy từ token nếu bỏ trống |
| `GUILD_ID` | ❌ | **Chỉ DEV** — đăng ký lệnh tức thì 1 server |
| `SKIP_DEPLOY` | ❌ | `=1` để bỏ qua đăng ký lệnh mỗi lần restart (đặt sau lần deploy đầu) |

### 3) Database (1 lần)
Chạy lần lượt các file trong `supabase/migrations/` (`0001` → `0041`) trên **Supabase SQL Editor**
(hoặc Supabase CLI). Đã được thiết kế idempotent (`create ... if not exists` / `or replace`).

### 4) Chạy
```bash
npm install
npm run dev     # DEV: nodemon + GUILD_ID để lệnh cập nhật tức thì
npm start       # PROD
npm test        # unit test
```

---

## ☁️ Deploy (Wispbyte / panel Pterodactyl)
- Node **≥ 20**. Startup: `npm install && npm start`. Khai báo env trên panel (KHÔNG commit `.env`).
- Cập nhật: `git push` → **Restart** (panel `git pull`). Lệnh không đổi thì đặt `SKIP_DEPLOY=1`.
- Lần đầu lên production: **bỏ `GUILD_ID`** để đăng ký lệnh global (mất ~1h Discord cache).

---

## 🎱 Loto & Bingo (chơi trong voice)
`/loto` mở phòng, mỗi người `.so` mua vé **5 số 01–90**, `.ds` xem danh sách, chủ phòng `.start`/`.end`.
`/bingo` mở phòng, `.mua` mua vé, `.check` xem vé, chủ phòng `.start`/`.end` — máy tự gọi số.
Cả hai **yêu cầu vào phòng voice** để mở game.

---

## 📄 License
ISC — xem `package.json`.

> 🌸 *“Cố lên nhé! Hôm nay cậu đã vất vả rồi, Waguri luôn ở sau cổ vũ cậu!”*

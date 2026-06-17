# 🌸 Waguri — Discord Economy & RPG Bot (Vietnamese Theme)

[![discord.js](https://img.shields.io/badge/discord.js-v14.25.1-5865F2.svg)](https://discord.js.org)
[![Supabase](https://img.shields.io/badge/Database-Supabase%20%2F%20Postgres-3ECF8E.svg)](https://supabase.com)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Waguri** là Discord bot kinh tế & nhập vai (Economy/RPG) bản địa hóa đậm chất đời sống Việt Nam:
khởi đầu từ những nghề vỉa hè (bán trà đá, chạy xe ôm công nghệ) rồi vươn lên thành đại gia,
leo bảng xếp hạng server. Persona của bot: *"Có làm mới có ăn 💢"*.

> Vòng lặp cốt lõi: **Làm việc → Kiếm VNĐ → Mua đồ nghề → Lên cấp → Mở nghề xịn → Bá chủ leaderboard.**

---

## ✨ Tính năng hiện có

- **💼 `/work`** — đi làm kiếm tiền theo nghề, có rủi ro & EXP, cooldown chống spam.
- **📈 Hệ thống Level/EXP** — công thức thuần (`src/lib/leveling.js`), tự báo lên cấp.
- **⚡ Chống dupe tiền & race condition** — mọi giao dịch tiền/EXP/cooldown chạy bằng **RPC nguyên tử (atomic)** trong PostgreSQL.
- **⚙️ Config tập trung** — chỉnh cân bằng game ở `src/config/index.js`.
- **🛠️ Tiện ích** — `/ping`, `/server`, `/user`.

---

## 🧱 Công nghệ
- **discord.js** v14.25.1 (Slash Commands, intent `Guilds`)
- **Supabase (PostgreSQL)** qua `@supabase/supabase-js`
- **Node.js ≥ 20** (Supabase yêu cầu), test bằng native `node --test`

---

## 📁 Cấu trúc

```text
waguri/
├── index.js                 # Khởi chạy: nạp lệnh + auto-deploy + nạp event
├── package.json
├── test/leveling.test.js     # Unit test hệ thống level
├── supabase/migrations/
│   ├── 0001_schema.sql       # 5 bảng: users, jobs, items, inventory, cooldowns
│   └── 0002_functions.sql    # RPC nguyên tử (đã áp dụng vào project Supabase)
└── src/
    ├── database.js           # Helper Supabase (gọi RPC)
    ├── config/index.js       # Thông số cân bằng game
    ├── lib/leveling.js       # Hàm thuần EXP <-> Level
    ├── commands/
    │   ├── economy/work.js
    │   └── utility/{ping,server,user}.js
    └── events/{ready,interactionCreate}.js
```

---

## 🚀 Cài đặt & chạy

### 1. Setup Discord Developer Portal
1. [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**.
2. **General Information** → copy **Application ID** (= `CLIENT_ID`).
3. Tab **Bot** → **Reset Token** → copy (= `DISCORD_TOKEN`). Tắt **Public Bot** nếu để private.
4. **Privileged Intents:** không cần bật (bot chỉ dùng intent `Guilds`).
5. **OAuth2 → URL Generator:** scope `bot` + `applications.commands` → mời bot vào server.

### 2. Biến môi trường
```bash
cp .env.example .env   # rồi điền giá trị thật
```
| Biến | Ghi chú |
|---|---|
| `DISCORD_TOKEN`, `CLIENT_ID` | từ Developer Portal |
| `GUILD_ID` | (tùy chọn, chỉ DEV) ID server test → đăng ký lệnh tức thì |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | từ Supabase Project Settings |

### 3. Database (chỉ làm 1 lần)
Chạy `supabase/migrations/0001_schema.sql` rồi `0002_functions.sql` trong **Supabase SQL Editor**.

### 4. Chạy
```bash
npm install
npm run dev     # DEV: nodemon tự reload (đặt GUILD_ID để lệnh cập nhật tức thì)
npm start       # PROD
npm test        # chạy unit test
```

---

## ☁️ Deploy (Wispbyte)
Bot deploy từ GitHub: trên panel bật `AUTO_UPDATE=1`, đặt startup `npm install && npm start`,
khai báo env vars trên panel (KHÔNG commit `.env`). Cập nhật code: `git push` → bấm **Restart** (server tự `git pull`).

---

## 📄 License
MIT — xem [LICENSE](LICENSE).

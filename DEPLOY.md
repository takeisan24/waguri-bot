# Deploy bot Choco 24/7 trên Oracle Cloud Always Free

VPS **miễn phí vĩnh viễn**, **không ngủ**, ổn định nhất trong các lựa chọn free.
Thẻ chỉ dùng để **xác minh danh tính** — Oracle KHÔNG trừ tiền nếu bạn ở trong tài nguyên "Always Free".
Bot chỉ kết nối **đi ra ngoài** → **không cần mở port inbound nào.**

---

## ⚠️ Bước 0 — Kiểm tra TRƯỚC (hay là lý do bot "không lên")

**Bật Privileged Intent trên Discord:** Bot dùng `MessageContent` (privileged). Chưa bật → bot **crash khi login** (*"Used disallowed intents"*).
→ https://discord.com/developers/applications → app của bạn → **Bot** → bật **MESSAGE CONTENT INTENT** → Save.

> Supabase RPC đã được áp dụng & test sẵn — không cần làm gì thêm ở phía database.

---

## A. Tạo tài khoản & VM Oracle Cloud

1. Đăng ký: https://www.oracle.com/cloud/free/ — nhập thẻ để xác minh (không trừ tiền). Chọn Region gần, vd **Singapore**.
2. ☰ → **Compute → Instances → Create Instance:**
   - **Image:** Canonical **Ubuntu 22.04** (hoặc 24.04).
   - **Shape:** *Change Shape* → **Ampere (ARM)** → `VM.Standard.A1.Flex`, đặt **1 OCPU / 6 GB RAM**.
   - **SSH keys:** *Generate a key pair for me* → **TẢI private key (.key) về máy** (không tải lại được!).
   - **Create.**

> ⚠️ **Cạm bẫy ARM:** hay báo *"Out of host capacity"*. Cách xử lý:
> - Thử lại sau vài phút / đổi **Availability Domain** (AD-1 → AD-2/3).
> - Bí quá thì dùng shape x86 **`VM.Standard.E2.1.Micro`** (cũng Always Free, đủ chạy bot nhẹ này).

---

## B. Kết nối SSH

Lấy **Public IP** ở trang Instance. Trên máy bạn (Git Bash / PowerShell):
```bash
chmod 400 đường-dẫn/ssh-key.key          # Git Bash/Linux; Windows có thể bỏ qua
ssh -i đường-dẫn/ssh-key.key ubuntu@<PUBLIC_IP>
```
(User Ubuntu mặc định là `ubuntu`.)

---

## C. Cài Node.js (dùng nvm — tránh lỗi repo ARM)
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
node -v
```

---

## D. Lấy code từ GitHub
```bash
git clone https://github.com/takeisan24/chocobot.git
cd chocobot
```

---

## E. Tạo file .env trên VM
File `.env` bị gitignore (đúng) nên KHÔNG đi theo git → phải tạo tay:
```bash
nano .env
```
Dán (điền giá trị thật từ `.env` máy bạn):
```
DISCORD_TOKEN=...
CLIENT_ID=...
SUPABASE_URL=https://kuvlkaxregnanhzgqrbp.supabase.co
SUPABASE_SERVICE_KEY=...
```
Lưu: `Ctrl+O` → `Enter` → `Ctrl+X`.

---

## F. Cài deps & chạy 24/7 bằng pm2
```bash
npm ci --omit=dev          # cài từ lockfile, bỏ nodemon (devDependency)
npm install -g pm2

pm2 start ecosystem.config.js   # khởi động bot (cấu hình pm2 đã có sẵn trong repo)
pm2 logs choco                  # PHẢI thấy "Ready! Logged in as ..."
pm2 save                        # lưu danh sách tiến trình
pm2 startup                     # in ra 1 lệnh -> COPY & CHẠY lệnh đó (sống lại sau reboot)
```
Vào Discord gõ `/ping` → ra `Pong!` là xong. Đóng SSH thoải mái, bot vẫn chạy 24/7. 🎉

---

## G. Lệnh pm2 hay dùng
| Việc | Lệnh |
|---|---|
| Xem log realtime | `pm2 logs choco` |
| Trạng thái | `pm2 status` |
| Cập nhật code mới | `git pull && pm2 restart choco` |
| Dừng / khởi động lại | `pm2 stop choco` / `pm2 restart choco` |

---

## Ghi chú
- **Không cần UptimeRobot, không cần mở port firewall** — bot chỉ kết nối ra ngoài; pm2 + `pm2 startup` lo việc 24/7 kể cả sau reboot.
- Dev ở máy local vẫn dùng `npm run dev` (nodemon); prod trên VM dùng pm2.
- Express server (`/`) chỉ là /health tùy chọn, không bắt buộc trên VPS.

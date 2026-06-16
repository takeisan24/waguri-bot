# Deploy bot Choco 24/7 trên Oracle Cloud Always Free

Hướng dẫn host bot chạy 24/7 **miễn phí vĩnh viễn** bằng VM Always Free của Oracle.
Bot Discord chỉ tạo kết nối **đi ra ngoài** (outbound) tới Discord/Supabase → **không cần mở port inbound nào cả**.

---

## A. Tạo tài khoản & VM Oracle Cloud

1. Đăng ký tại https://www.oracle.com/cloud/free/
   - **Cần thẻ visa/mastercard để xác minh danh tính** — Oracle KHÔNG trừ tiền nếu bạn chỉ dùng tài nguyên "Always Free".
   - Chọn Region gần (vd `Singapore` / `ap-southeast-1`) trùng region Supabase cho nhanh.

2. Tạo VM: menu ☰ → **Compute → Instances → Create Instance**
   - **Image:** Canonical **Ubuntu 22.04** (hoặc 24.04).
   - **Shape:** bấm *Change Shape* → **Ampere (ARM)** → `VM.Standard.A1.Flex`, đặt **1 OCPU / 6 GB RAM** (Always Free cho tới 4 OCPU/24GB ARM — 1 core quá đủ cho 1 bot).
   - **SSH keys:** chọn *Generate a key pair for me* → **TẢI private key (.key) về máy** (rất quan trọng, không tải lại được).
   - Create.

> ⚠️ **Cạm bẫy hay gặp:** ARM thường báo lỗi *"Out of host capacity"*. Cách xử lý:
> - Thử lại sau vài phút, hoặc đổi **Availability Domain** (AD-1 → AD-2/AD-3).
> - Nếu mãi không được: tạm dùng shape x86 **`VM.Standard.E2.1.Micro`** (cũng Always Free) — bot nhẹ nên chạy ổn.

---

## B. Kết nối SSH vào VM

Lấy **Public IP** ở trang Instance. Trên máy bạn (PowerShell/Git Bash):

```bash
# Đặt quyền cho key (Git Bash / Linux)
chmod 400 đường-dẫn/ssh-key.key
ssh -i đường-dẫn/ssh-key.key ubuntu@<PUBLIC_IP>
```
(User mặc định của Ubuntu là `ubuntu`. Oracle Linux thì là `opc`.)

---

## C. Cài Node.js trên VM (dùng nvm — tránh lỗi repo ARM)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22          # khớp Node v22 bạn đang dev
node -v                 # kiểm tra
```

---

## D. Đưa code lên VM

**Cách 1 — qua GitHub (khuyến nghị):** push repo lên GitHub (private cũng được), rồi:
```bash
git clone https://github.com/<bạn>/Choco.git
cd Choco
```

**Cách 2 — copy thẳng từ máy (không cần GitHub):** chạy trên MÁY BẠN:
```bash
scp -i ssh-key.key -r D:/project/Choco ubuntu@<PUBLIC_IP>:~/Choco
```

> 🔐 File `.env` bị `.gitignore` (đúng vậy) nên **không** đi theo git. Phải tạo `.env` thủ công trên VM ở bước E.

---

## E. Tạo file .env trên VM

```bash
cd ~/Choco
nano .env
```
Dán nội dung (lấy giá trị từ `.env` máy bạn):
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
npm install --omit=dev      # production: bỏ qua nodemon
npm install -g pm2

pm2 start ecosystem.config.js   # khởi động bot
pm2 logs choco                  # XEM LOG: phải thấy "Ready! Logged in as ..."
pm2 save                        # lưu danh sách tiến trình
pm2 startup                     # in ra 1 lệnh -> COPY & CHẠY lệnh đó (bật lại sau reboot)
```

Xong! Đóng SSH thoải mái, bot vẫn chạy.

---

## G. Lệnh pm2 hay dùng

| Việc | Lệnh |
|---|---|
| Xem log realtime | `pm2 logs choco` |
| Xem trạng thái | `pm2 status` |
| Khởi động lại | `pm2 restart choco` |
| Dừng | `pm2 stop choco` |
| Cập nhật code mới | `git pull && pm2 restart choco` |

---

## Ghi chú
- **Không cần UptimeRobot** nữa — pm2 giữ tiến trình sống & tự restart khi crash; `pm2 startup` lo việc sống lại sau reboot.
- **Không cần mở port firewall** — bot chỉ kết nối ra ngoài. (Express server ở port 3000 chỉ là tùy chọn /health, không bắt buộc.)
- Dev ở máy local vẫn dùng `npm run dev` (nodemon). Prod trên VM dùng pm2.

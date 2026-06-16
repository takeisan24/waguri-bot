# 🍫 Choco Bot — Discord Economy & RPG Bot (Vietnamese Cultural Theme)

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-blue.svg)](https://nodejs.org)
[![Discord.js Version](https://img.shields.io/badge/discord.js-v14.25.1-5865F2.svg)](https://discord.js.org)
[![Supabase](https://img.shields.io/badge/Database-Supabase%20%2F%20Postgres-3ECF8E.svg)](https://supabase.com)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Choco** là một mã nguồn mở Discord Bot được phát triển bằng `discord.js` v14 và tích hợp cơ sở dữ liệu **Supabase (PostgreSQL)**. Điểm nổi bật của bot là hệ thống **Kinh tế (Economy) & Nhập vai (RPG)** độc đáo được bản địa hóa đậm chất văn hóa đường phố và đời sống công nghệ Việt Nam (như bán trà đá vỉa hè, chạy xe ôm công nghệ, hay lập trình viên gõ phím thuê).

---

## ✨ Các Tính Năng Nổi Bật

- **💼 Hệ thống Nghề nghiệp độc đáo:** Làm việc `/work` nhận lương tùy theo cấp bậc và công việc hiện tại, đi kèm rủi ro (risk rate) và kịch bản thú vị.
- **📈 Hệ thống Cấp độ & EXP:** Công thức tính toán cấp độ chuẩn chỉnh dựa trên EXP tích lũy. Tự động thông báo lên cấp kèm thanh tiến trình trực quan.
- **⚡ Chống Dupe Tiền & Race Condition:** Mọi giao dịch tiền tệ, cộng kinh nghiệm và đăng ký cooldown đều được xử lý dưới dạng **RPC (Stored Procedures) nguyên tử (Atomic)** trực tiếp trong database PostgreSQL, ngăn chặn triệt để hành vi spam click để nhân bản tài sản.
- **⚙️ Cấu hình Tập trung:** Quản lý toàn bộ thông số game (thời gian chờ, màu sắc hiển thị, tỷ lệ rủi ro, lương tối thiểu/tối đa) tại một file cấu hình duy nhất `src/config/index.js`.
- **🚀 Tự động Đăng ký Slash Commands:** Bot tự động kiểm tra và đăng ký/làm mới danh sách lệnh Slash (`/`) lên Discord API mỗi khi khởi động nếu cấu hình đủ Token.
- **🌐 HTTP Keep-Alive Server:** Tích hợp máy chủ Express nhỏ giúp giữ bot hoạt động liên tục 24/7 khi triển khai trên các nền tảng đám mây như Render.com, Railway, Heroku.

---

## 🛠️ Công Nghệ Sử Dụng

- **Runtime:** Node.js (v16 trở lên)
- **Library chính:** `discord.js` v14.25.1
- **Database:** Supabase (PostgreSQL)
- **Database Client:** `@supabase/supabase-js` v2.99.1
- **Web Server:** Express.js (giữ bot online 24/7)
- **Test Runner:** Native Node.js Test Runner (cho unit test hệ thống leveling)

---

## 📁 Cấu Trúc Thư Mục Dự Án

```text
Choco/
├── .env.example              # Mẫu tệp cấu hình biến môi trường
├── .gitignore                # Chỉ định tệp tin Git bỏ qua
├── LICENSE                   # Giấy phép MIT
├── index.js                  # Điểm khởi chạy chính & HTTP Server
├── deploy-commands.js        # Script đăng ký thủ công Slash Commands
├── package.json              # Quản lý thư viện và script
├── package-lock.json         # Khóa phiên bản thư viện cài đặt
├── test/                     # Thư mục chứa các unit test
│   └── leveling.test.js      # Unit test cho hệ thống quy đổi cấp độ
├── supabase/                 # Chứa mã nguồn thiết lập database
│   └── migrations/
│       ├── 0001_schema.sql   # Khởi tạo 5 bảng cấu trúc cốt lõi
│       └── 0002_functions.sql# Định nghĩa các RPC nguyên tử (Atomic)
└── src/
    ├── database.js           # Bộ Helper kết nối và truy vấn Supabase
    ├── commands/             # Chứa mã lệnh Slash của Bot
    │   ├── economy/          # Lệnh liên quan đến kinh tế (như /work)
    │   └── utility/          # Lệnh tiện ích (ping, server, user...)
    ├── config/
    │   └── index.js          # Nơi cấu hình toàn bộ thông số cân bằng game
    ├── events/
    │   └── interactionCreate.js # Xử lý tương tác nút, lệnh tự động hoàn thành
    └── lib/
        └── leveling.js       # Thư viện thuần (pure function) xử lý EXP/Level
```

---

## 💾 Cấu Trúc Database Schema & RPC

Database sử dụng **5 bảng cơ bản** được tối ưu hóa liên kết và hiệu suất bằng các Index:
1. `items`: Quản lý danh sách vật phẩm trong cửa hàng toàn cục.
2. `jobs`: Thiết lập danh sách công việc cùng mức lương yêu cầu và các vật phẩm đi kèm.
3. `users`: Lưu trữ thông tin số dư ví (`wallet`), ngân hàng (`bank`), điểm kinh nghiệm (`exp`) và công việc (`job_id`).
4. `inventory`: Bảng quan hệ Nhiều-Nhiều (N-N) lưu trữ vật phẩm người chơi sở hữu.
5. `cooldowns`: Quản lý khóa kép thời gian chờ thực hiện lệnh của từng người dùng.

### Các hàm nguyên tử (Database RPC Functions)
*Để đảm bảo an toàn giao dịch, các hàm sau được viết bằng PL/pgSQL:*
- `increment_balance(p_user_id, p_field, p_amount)`: Cộng trừ tiền an toàn trực tiếp trên DB, kiểm tra số dư tối thiểu tránh bị âm tiền.
- `transfer_money(p_from, p_to, p_amount)`: Thực hiện chuyển tiền giữa 2 tài khoản trong 1 Transaction đơn lẻ.
- `add_exp(p_user_id, p_amount)`: Tăng kinh nghiệm và trả về tổng EXP mới.
- `claim_cooldown(p_user_id, p_command, p_duration_seconds)`: Kiểm tra và đặt thời gian chờ mới chỉ trong 1 truy vấn duy nhất.

---

## 🚀 Hướng Dẫn Cài Đặt Chi Tiết

### 1. Chuẩn bị môi trường
- Máy tính đã cài đặt **Node.js LTS** (Khuyên dùng v18+).
- Một tài khoản **Supabase** đang hoạt động (Tạo project mới miễn phí).
- Một ứng dụng Bot được tạo sẵn trên **Discord Developer Portal** (Nhớ kích hoạt các tùy chọn trong phần **Privileged Gateway Intents** bao gồm `PRESENCE INTENT`, `SERVER MEMBERS INTENT`, và `MESSAGE CONTENT INTENT`).

### 2. Tải mã nguồn và cài đặt dependencies
```bash
git clone https://github.com/your-username/Choco.git
cd Choco
npm install
```

### 3. Cấu hình biến môi trường
Sao chép tệp tin cấu hình mẫu và điền đầy đủ các thông tin của bạn:
```bash
cp .env.example .env
```
Mở tệp `.env` mới tạo và điền các khóa cấu hình:
- `DISCORD_TOKEN`: Token của Discord Bot.
- `SUPABASE_URL`: Đường dẫn API của dự án Supabase.
- `SUPABASE_SERVICE_KEY`: Khóa `service_role` (không dùng khóa `anon` để đảm bảo bot có quyền bypass RLS).

### 4. Triển khai cấu trúc Database
1. Mở **Supabase Dashboard** của bạn.
2. Truy cập mục **SQL Editor**.
3. Copy và chạy lần lượt nội dung các file trong thư mục `supabase/migrations/`:
   - File [0001_schema.sql](file:///d:/project/Choco/supabase/migrations/0001_schema.sql) để tạo bảng và cấu trúc.
   - File [0002_functions.sql](file:///d:/project/Choco/supabase/migrations/0002_functions.sql) để tạo các Stored Procedure phòng chống hack/dupe tiền.

### 5. Đăng ký Slash Commands và Chạy Bot
Khi bạn khởi động bot lần đầu tiên bằng lệnh dưới đây, bot sẽ **tự động** đăng ký toàn bộ Slash Commands lên Discord:
```bash
# Chạy ở chế độ phát triển (Sử dụng nodemon tự động tải lại code khi sửa)
npm run dev

# Chạy ở chế độ production
npm start
```

### 6. Chạy thử nghiệm các Unit Test
Để kiểm tra tính toàn vẹn của logic quy đổi cấp độ và EXP:
```bash
npm test
```

---

## 🤝 Hướng Dẫn Đóng Góp (Contributing)

Rất hoan nghênh mọi đóng góp cải tiến của bạn để giúp bot Choco ngày càng hoàn thiện và thú vị hơn!
1. Fork dự án này.
2. Tạo một nhánh mới (`git checkout -b feature/AmazingFeature`).
3. Commit các thay đổi của bạn (`git commit -m 'Add some AmazingFeature'`).
4. Push nhánh của bạn lên Github (`git push origin feature/AmazingFeature`).
5. Mở một **Pull Request** trên repository gốc.

---

## 📄 Giấy Phép (License)

Dự án này được phân phối theo Giấy phép **MIT License**. Xem thêm chi tiết tại tệp tin `LICENSE`.

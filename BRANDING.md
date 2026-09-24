# Waguri — Branding & Thông tin đăng ký (Developer Portal / top.gg)

> ⚠️ **Bản mô tả để submit bot list đã chuyển sang `docs/bot-listing-copy.md` (cập nhật v2.6.0).**
> File này giữ lại phần Developer Portal / Privacy / ToS; các khối mô tả bên dưới là bản tham khảo.

Tài liệu sẵn để copy vào **Discord Developer Portal** và **top.gg**. Hướng tới: list lên top.gg + verify bot.

---

## 1) Developer Portal → General Information

**Name:** `Waguri`

**Description** (≤ 400 ký tự, hiện trong hồ sơ bot):
> Waguri 🌸 — Bạn gái AI waifu & Quản gia kinh tế RPG bản địa hóa Việt Nam! Trò chuyện AI có trí nhớ, Phòng học Pomodoro 24/7 (/study) & Web Lofi Room, Sổ sứ mệnh Pass mùa giải, Chuyển sinh (/prestige), Thú cưng tiến hóa, Tiệm bánh Gekka Cấp 3, Quỹ tín dụng Kikyo (/loan), Minigame (Tài xỉu, Bầu cua, Lì xì) & cày cuốc (/work, /fish, /mine, /chop). Hỗ trợ Song ngữ Việt/Anh 100%, 72 slash commands & prefix `w!`.

**Tags / Interactions Endpoint:** để trống (bot dùng gateway, không dùng interactions endpoint URL).

**Privileged Gateway Intents:** bật **MESSAGE CONTENT INTENT** (cần cho prefix + tag AI).

**Installation:** Guild Install. Scopes mời: `bot` + `applications.commands`.
**Quyền (permissions) tối thiểu:** Send Messages, Embed Links, Read Message History, Use External Emojis, Add Reactions, View Channels.

---

## 2) top.gg — Mô tả ngắn (Short Description, < 140 ký tự)
> AI waifu có trí nhớ & Game kinh tế RPG Việt: Trò chuyện AI, Pomodoro /study, Sổ sứ mệnh, Chuyển sinh, Thú cưng, Minigame. 72 lệnh, Slash & w!.

## 3) top.gg — Mô tả dài (Long Description, Markdown)

```markdown
# 🌸 Waguri — Bạn gái AI Waifu & Hệ sinh thái Kinh tế / RPG Discord

> **Waguri** là cô bạn AI dịu dàng mang trí nhớ riêng, kết hợp với game kinh tế nhập vai đậm chất văn hóa Việt Nam, hỗ trợ **Song ngữ Việt/Anh (i18n 100%)**, 72 lệnh **/slash** chuẩn hóa và **prefix `w!`**.

---

## ✨ TÍNH NĂNG NỔI BẬT (v2.6.0)

### 🤖 1. Trò Chuyện AI & Trí Nhớ Riêng (`/ask`, Tag @Waguri)
- **Persona Waguri**: Trò chuyện ngọt ngào, thông minh và dí dỏm bằng Gemini AI.
- **Trí nhớ cá nhân (AI Memory)**: Waguri có khả năng ghi nhớ tên gọi, sở thích, tính cách của bạn qua từng cuộc trò chuyện.
- **Lời Tự Thú Chữa Lành (`/confession`)**: Waguri lắng nghe và chia sẻ tâm sự riêng tư của bạn bằng góc nhìn AI ấm áp.

### 📚 2. Phòng Học Bài Pomodoro 24/7 & Web Lofi Study Room (`/study`)
- **Tập trung cùng Waguri**: Chế độ Pomodoro trực quan ngay trong Discord, theo dõi chuỗi chuyên cần `study_streak`, nhận Xu, EXP và Điểm Tri Thức.
- **Web Lofi Study Room HD**: Trải nghiệm không gian học tập trực quan tại Web Dashboard tích hợp nhạc Lo-Fi chất lượng cao.

### 📜 3. Sổ Sứ Mệnh Season Pass (`/pass`)
- Hệ thống Battle Pass tính theo mùa giải Âm lịch Việt Nam.
- Làm nhiệm vụ daily/weekly, cày cuốc & trò chuyện để tăng cấp Pass, mở khóa kho phần thưởng cực giá trị.

### 🌟 4. Vòng Lặp Chuyển Sinh Prestige (`/prestige`)
- Khi đạt cấp độ tối đa, thực hiện Chuyển Sinh để nhận buff chỉ số vĩnh viễn và hiệu ứng **Khung Avatar Hào Quang (Glow Border)** lấp lánh trên Web Profile.

### 🏆 5. Sổ Tay Sưu Tầm / Album & Rarity (`/album`)
- Thu thập hàng trăm vật phẩm quý hiếm (Cá Rồng Vàng, Kỳ Nam, Vàng Đông Triều...) từ `/fish`, `/mine`, `/chop`, `/craft`.
- Đủ bộ sưu tập để nhận danh hiệu và phần thưởng độc quyền.

### 🐾 6. Thú Cưng Tiến Hóa & Cây Kỹ Năng (`/pet`)
- Nuôi thú cưng qua 3 giai đoạn tiến hóa với hình ảnh sinh động.
- Nâng điểm **Cây kỹ năng bị động (Skill Tree)** trên Web Dashboard để nhận buff sản lượng và may mắn.

### 🍞 7. Tiệm Bánh Gekka Cấp 3 & Đơn Hàng VIP (`/bakery` / `/tiembanh`)
- Nâng cấp tiệm bánh lên tới Cấp 3 (Đại Tiệm Bánh Gekka) mở khóa lò nướng tự động và nhân viên thứ hai.
- Giao đơn hàng VIP hằng ngày cho các nhân vật lore Waguri, kích hoạt Giờ Cao Điểm x1.2 doanh thu.

### 🎲 8. Kinh Tế & Minigame Dân Gian Đậm Chất Việt
- 💼 **Nghề nghiệp & Cày cuốc**: đi làm `/work`, chọn nghề `/jobs`, đào khoáng `/mine`, chặt gỗ `/chop`, câu cá `/fish`.
- 🏦 **Quỹ tín dụng Kikyo (`/loan`)**: Vay tiền trực tiếp từ quỹ trường Kikyo với kỳ hạn cố định 7 ngày và lãi suất 5%.
- 🧧 **Lì xì & Tương tác**: `/lucky-money` (phát lì xì cả channel), `/ship` (bói duyên), `/date` (hẹn hò).
- 🎲 **Minigames**: Tài xỉu `/sicbo`, Bầu cua `/bau-cua`, Xổ số `/lottery`, Blackjack `/blackjack`, Đua ngựa `/horserace`.
- 🎖️ **Cửa hàng Huy hiệu**: `/cosmetic` sưu tầm huy hiệu lấp lánh trưng bày trên Web Profile.

---

## 🌐 WEBSITE DASHBOARD & COMMANDS EXPLORER
- **Web Profile**: Xem chi tiết tài sản, thành tựu, khung chuyển sinh, huy hiệu và cây kỹ năng thú cưng tại Web Dashboard.
- **Trang Tra Cứu Lệnh**: Tìm kiếm và lọc toàn bộ 72 lệnh chuẩn hóa linh hoạt.

---

## 🚀 BẮT ĐẦU VỚI WAGURI
1. Mời Waguri vào server Discord của bạn.
2. Gõ `/help` để xem danh sách lệnh trực quan, hoặc gõ `/ask` để chào cô bạn AI nhé!

 Made with 🌸 for Discord communities.
```

**Tags gợi ý:** `economy`, `ai`, `rpg`, `vietnamese`, `pomodoro`, `lofi`, `study`, `anime`, `fun`, `game`.

---

## 4) Privacy Policy (bản nháp — top.gg verify thường yêu cầu URL)

```markdown
# Privacy Policy — Waguri

Waguri lưu trữ dữ liệu tối thiểu để vận hành game kinh tế và trò chuyện AI:
- Discord User ID, số dư ví/ngân hàng, cấp độ/EXP, năng lượng, nghề nghiệp, vật phẩm, tiến độ nhiệm vụ/thành tựu/Pass, thú cưng, thông tin bang hội, và trí nhớ AI (`ai_memory`).
- Dữ liệu `ai_memory` và ngữ cảnh trò chuyện chỉ phục vụ cho trải nghiệm trò chuyện cá nhân hóa. Người dùng có thể tự xóa toàn bộ dữ liệu cá nhân bất kỳ lúc nào bằng lệnh `/deletedata`.
- Dữ liệu được lưu trữ bảo mật trên Supabase (PostgreSQL).

Liên hệ hỗ trợ: <điền Discord/email của bạn>.
```

## 5) Terms of Service (bản nháp)

```markdown
# Terms of Service — Waguri

- Tiền tệ và vật phẩm trong Waguri là ảo, không có giá trị quy đổi tiền thật.
- Không lạm dụng, spam, hoặc khai thác lỗi (bug). Vi phạm có thể bị reset hoặc cấm sử dụng bot.
- Bot được cung cấp "nguyên trạng", không bảo đảm hoạt động liên tục 100%.
- Liên hệ hỗ trợ: <điền Discord/email của bạn>.
```

---

## 6) Checklist hình ảnh (làm "visual chất" hơn)
- **Avatar**: Ảnh Waguri Kaoruko vuông, rõ nét (Portal → Bot → icon).
- **Banner**: Ảnh ngang đẹp (Portal → App → App Icon/Banner).
- **About Me**: Dùng mô tả ngắn ở mục (1).
- **Status**: Đặt status động xoay vòng thông số & persona.

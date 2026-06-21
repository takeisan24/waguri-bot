# Waguri — Branding & Thông tin đăng ký (Developer Portal / top.gg)

Tài liệu sẵn để copy vào **Discord Developer Portal** và **top.gg**. Hướng tới: list lên top.gg + verify bot.

---

## 1) Developer Portal → General Information

**Name:** `Waguri`

**Description** (≤ 400 ký tự, hiện trong hồ sơ bot):
> Waguri 🌸 — cô bạn AI waifu kiêm "quản gia kinh tế" cho server của bạn! Trò chuyện mọi điều bằng AI, chơi hệ thống kinh tế nhập vai đậm chất Việt Nam (đi làm, mở nghề, mua sắm, minigame may rủi, lì xì...), nhiệm vụ, thành tựu, bảng xếp hạng và nhiều minigame vui. Hỗ trợ cả lệnh `/slash` lẫn prefix `w!`.

**Tags / Interactions Endpoint:** để trống (bot dùng gateway, không dùng interactions endpoint URL).

**Privileged Gateway Intents:** bật **MESSAGE CONTENT INTENT** (cần cho prefix + tag AI).

**Installation:** Guild Install. Scopes mời: `bot` + `applications.commands`.
**Quyền (permissions) tối thiểu:** Send Messages, Embed Links, Read Message History, Use External Emojis, Add Reactions, View Channels.

---

## 2) top.gg — Mô tả ngắn (Short Description, ≤ 200 ký tự)
> Bạn gái AI waifu + game kinh tế nhập vai chất Việt Nam: trò chuyện AI, đi làm, lì xì, minigame may rủi, nhiệm vụ, thành tựu. Slash & prefix `w!`.

## 3) top.gg — Mô tả dài (Long Description, Markdown)

```markdown
# 🌸 Waguri — Bạn gái AI & Game kinh tế cho server của bạn

Waguri vừa là **cô bạn AI** biết trò chuyện, vừa là **game kinh tế nhập vai** bản địa hóa đậm chất Việt Nam. Hỗ trợ cả lệnh **/slash** lẫn **prefix `w!`**.

## ✨ Tính năng nổi bật
- 💬 **Trò chuyện AI**: `/ask` hoặc tag @Waguri để hỏi bất cứ điều gì, theo phong cách waifu dịu dàng.
- 💼 **Kinh tế & Nghề**: `/work`, `/fish` kiếm tiền (hệ thống năng lượng), `/jobs` mở nghề từ bán trà đá → đại gia.
- 🏪 **Cửa hàng & Kho**: `/shop`, `/buy`, `/sell`, `/eat` (đồ ăn hồi năng lượng & buff).
- 🎲 **Minigame**: `/coinflip`, `/taixiu`, `/baucua`, `/blackjack`.
- 🧧 **Cộng đồng Việt**: `/lixi` (lì xì cả kênh), `/ship`, `/boi` (xem bói).
- 📜 **Tiến trình**: `/quest` nhiệm vụ ngày, `/achievements` thành tựu, `/leaderboard` đua top.
- 🏦 Ngân hàng, chuyển tiền, cướp (`/rob`)... và nhiều hơn nữa!

## 🚀 Bắt đầu
Gõ `/help` để xem tất cả lệnh, hoặc `/help <lệnh>` để xem chi tiết.

Made with 🌸 for Vietnamese Discord communities.
```

**Tags gợi ý:** `economy`, `fun`, `anime`, `ai`, `game`, `community`, `rpg`, `vietnamese`, `chat`, `social`.

---

## 4) Privacy Policy (bản nháp — top.gg verify thường yêu cầu URL)

```markdown
# Privacy Policy — Waguri

Waguri lưu trữ dữ liệu tối thiểu để vận hành game kinh tế:
- Discord User ID, số dư ví/ngân hàng, cấp độ/EXP, năng lượng, nghề, vật phẩm, tiến độ nhiệm vụ/thành tựu.
- KHÔNG lưu nội dung tin nhắn lâu dài. Ngữ cảnh trò chuyện AI chỉ giữ tạm trong bộ nhớ và mất khi bot khởi động lại; nội dung được gửi tới nhà cung cấp AI (Google Gemini) chỉ để tạo phản hồi.

Dữ liệu lưu trên Supabase (PostgreSQL). Người dùng có thể yêu cầu xóa dữ liệu của mình bằng cách liên hệ chủ bot.
Liên hệ: <điền Discord/email của bạn>.
```

## 5) Terms of Service (bản nháp)

```markdown
# Terms of Service — Waguri

- Tiền tệ và vật phẩm trong Waguri là ảo, không có giá trị quy đổi tiền thật.
- Không lạm dụng, spam, hoặc khai thác lỗi (bug). Vi phạm có thể bị reset dữ liệu.
- Bot cung cấp "nguyên trạng", không đảm bảo hoạt động liên tục 100%.
- Liên hệ hỗ trợ: <điền Discord/email của bạn>.
```

> Gợi ý: tạo 2 trang Privacy/ToS miễn phí (GitHub Pages / Gist / Notion public) rồi dán URL vào top.gg.

---

## 6) Checklist hình ảnh (làm "visual chất" hơn)
- **Avatar**: ảnh Waguri Kaoruko vuông, rõ nét (Portal → Bot → icon).
- **Banner**: ảnh ngang đẹp (Portal → App → App Icon/Banner; cần app có đủ điều kiện).
- **About Me**: dùng mô tả ngắn ở mục (1).
- Đặt **status động** đã có sẵn trong bot (xoay vòng số liệu + persona).

---
version: alpha
name: Waguri Gekka Bakery & Economy Enhancements Spec
description: Specifications for Gekka Web UI, Badges, Streak Freeze, Media Pool, Defer-first Audit, and Staging Bot.
colors:
  primary: "#F43F5E"        # Rose 500 (Waguri Pink)
  primary-hover: "#E11D48"  # Rose 600
  secondary: "#A855F7"      # Purple 500 (Gekka Violet)
  bg-dark: "#0D0812"        # Midnight Deep Violet
  glass-bg: "rgba(20, 12, 26, 0.6)"
  glass-border: "rgba(244, 63, 94, 0.15)"
  text-white: "#FFFFFF"
  text-slate: "#CBD5E1"
typography:
  title-xl:
    fontFamily: Inter, Outfit, sans-serif
    fontSize: 32px
    fontWeight: 900
    lineHeight: 1.2
  title-lg:
    fontFamily: Inter, Outfit, sans-serif
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.3
  body-md:
    fontFamily: Inter, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  md: 12px
  lg: 16px
  full: 9999px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
components:
  card:
    backgroundColor: "{colors.glass-bg}"
    rounded: "{rounded.lg}"
    border: "1px solid {colors.glass-border}"
    padding: "{spacing.lg}"
---

# WAGURI TECHNICAL SPECIFICATION (6-PART EXPANSION)

Tài liệu đặc tả kỹ thuật này là **nguồn sự thật duy nhất** cho thiết kế giao diện (UI) và kiến trúc cơ sở dữ liệu (Database/API) cho 6 phần nâng cấp tiếp theo của Waguri.

---

## 1. PHẦN B: TIỆM BÁNH GEKKA WEB UI & VOTE

### 1.1 Giao diện Trực quan `/tiem/[userId]` (Preset Slots)
* **Kích thước Lưới (Layout Grid):** Sử dụng CSS Grid/Flexbox dựng mặt bằng góc nhìn ngang (2.5D Mockup).
  * 3 Slot tường cố định (để treo tranh, đèn led).
  * 3 Slot nền cố định (để bàn ghế, quầy bánh, tủ kính).
  * 2 Slot nhân viên NPC đứng tại quầy làm bánh.
* **Cơ chế nạp:** 
  * API Web fetch dữ liệu của tiệm bánh từ Supabase (`decor` & `staff` JSONB).
  * Map từng ID vật phẩm trong mảng `decor` sang hình ảnh SVG/đường dẫn tương ứng và gán vào các Slot trống theo thứ tự ưu tiên.
* **UI Tokens:**
  * Background: Dùng gradient chuyển tiếp từ `{colors.bg-dark}` sang sắc hồng đào nhạt phía góc tiệm.
  * Các panel điều khiển/thông tin: `{components.card}`.

### 1.2 Database Schema & RPC
* **Bảng `bakery_likes`:**
  ```sql
  CREATE TABLE bakery_likes (
      liker_id TEXT NOT NULL,
      bakery_owner_id TEXT NOT NULL,
      liked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (liker_id, bakery_owner_id)
  );
  ALTER TABLE bakery_likes ENABLE ROW LEVEL SECURITY;
  -- Chỉ cho phép read công khai, write qua service_role (RPC)
  CREATE POLICY "Allow public read" ON bakery_likes FOR SELECT USING (true);
  ```
* **RPC `like_bakery(p_liker_id TEXT, p_bakery_owner_id TEXT)`:**
  * **Logic:**
    1. Kiểm tra số lượng dòng trong `bakery_likes` có `liker_id = p_liker_id` và `liked_at::date = now()::date`. Nếu `>= 3` -> Trả về `'limit'`.
    2. Chèn dòng mới vào `bakery_likes`. Nếu trùng khóa chính (đã thích hôm nay) -> Trả về `'already_liked'`.
    3. Trả về `'ok'`.

---

## 2. PHẦN C: HỆ THỐNG HUY HIỆU (BADGES) & SEASONAL ITEMS

### 2.1 Cột Badges trong bảng `users`
* **Kiểu dữ liệu:** `badges jsonb not null default '[]'`.
* **Cấu trúc mảng:** `["ma_huy_hieu_1", "ma_huy_hieu_2"]`.
* **Dữ liệu tĩnh (Tên, Mô tả, Emoji):** Lưu trữ tại `src/data/badges.js` (bot) và `web/src/data/badges.ts` (web).
* **Hiển thị `/profile`:** Render dải Emoji tương ứng với các mã huy hiệu ngay dưới tên hiển thị của user.

### 2.2 Vật phẩm theo mùa (Seasonal Items)
* **Logic Autocomplete/Store:** Lấy `Season ID` hiện tại (Spring, Summer, Autumn, Winter, Tet, Trung_Thu) từ helper hệ thống:
  * Nếu vật phẩm có thuộc tính `season` khớp với `Season ID` hoặc `season` trống -> Cho phép hiện và giao dịch.
  * Nếu không khớp -> Trả về lỗi khi mua bằng `/store buy`.

---

## 3. PHẦN D: ĐỒNG BĂNG CHUỖI (STREAK FREEZE)

### 3.1 Cấu hình Item
* ID vật phẩm: `streak_freeze`.
* Tên hiển thị: **Đá Đông Cứng Chuỗi** ❄️.
* Tác dụng: Tự động tiêu thụ khi quên điểm danh để bảo toàn chuỗi ngày.

### 3.2 Thuật toán Lazy check tại `/daily`
```javascript
const user = await db.getUser(userId);
const lastClaim = new Date(user.last_daily_at);
const diffHours = (Date.now() - lastClaim.getTime()) / (3600 * 1000);

if (diffHours > 48) { // trễ hơn mốc điểm danh
    const hasFreeze = await db.hasItem(userId, 'streak_freeze');
    if (hasFreeze) {
        await db.removeItem(userId, 'streak_freeze', 1);
        // Thay vì reset streak về 1, giữ nguyên streak và sửa last_daily_at lùi về 24h trước
        await db.updateUserStreak(userId, user.daily_streak, new Date(Date.now() - 24 * 3600 * 1000));
        // Tiến hành cộng lương bình thường
    } else {
        // Reset streak về 1
    }
}
```

---

## 4. HỆ THỐNG MEDIA POOL

### 4.1 File cấu hình `src/data/mediaPool.json`
* Cấu trúc JSON:
  ```json
  {
    "MAIN": [ "url_1", "url_2" ],
    "SUCCESS": [ "url_1" ],
    "ERROR": [ "url_1" ],
    "WARNING": [ "url_1" ],
    "JACKPOT": [ "url_1" ]
  }
  ```

### 4.2 Module tích hợp `src/config/index.js`
* Đọc động tệp tin `mediaPool.json`. Nếu tệp tin không tồn tại hoặc lỗi cú pháp, tự động fallback về cấu hình mảng rỗng (bot dùng avatar mặc định).

---

## 5. VÁ LỖI 10062 (DEFER-FIRST AUDIT)

### 5.1 Sửa đổi thư viện sảnh chờ `lobby.js`
* Sửa đổi phương thức `openLobby` để kiểm tra trạng thái tương tác trước khi phản hồi:
  ```javascript
  if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [render()], components: [buttons()] });
  } else {
      await interaction.reply({ embeds: [render()], components: [buttons()] });
  }
  ```

### 5.2 Sửa đổi lệnh Confession & Minigames
* Gọi `await interaction.deferReply()` ở câu lệnh đầu tiên trong hàm `execute`.
* Thay thế toàn bộ các lệnh phản hồi sau đó:
  * `interaction.reply` &rarr; `interaction.editReply`.
  * Lệnh gửi tin nhắn phụ &rarr; `interaction.followUp`.

---

## 6. CẤU HÌNH STAGING BOT (.ENV.LOCAL OVERRIDES)

### 6.1 Tệp tin `src/lib/envLoader.js`
* Logic nạp chồng biến môi trường:
  ```javascript
  const fs = require('node:fs');
  const path = require('node:path');
  require('dotenv').config();

  const localPath = path.join(__dirname, '../../.env.local');
  if (fs.existsSync(localPath)) {
      const dotenv = require('dotenv');
      const envConfig = dotenv.parse(fs.readFileSync(localPath));
      for (const k in envConfig) {
          process.env[k] = envConfig[k];
      }
  }
  ```
* Toàn bộ lệnh chạy tại client hoặc test sẽ import tệp này đầu tiên để đảm bảo tính an toàn dữ liệu.

---

## 7. PHẦN H: BẢN TIN & WEB CHANGELOG (v2.3)

### 7.1 Giao diện Trang chủ & Lịch sử Bản vá `/changelog`
* **Rút gọn bản tin trang chủ:**
  * Giới hạn hiển thị tối đa 2 tin tức mới nhất từ tệp dữ liệu dùng chung `changelogs.json`.
  * Thêm nút chuyển tiếp dạng link văn bản lấp lánh (với hiệu ứng hover dịch chuyển nhẹ 4px) trỏ đến trang `/changelog`.
* **Trang `/changelog` (Dòng thời gian):**
  * Dựng một trục dọc (vertical timeline axis) dùng đường kẻ đứt nét màu `{colors.glass-border}`.
  * Mỗi bản vá được thể hiện bằng một hạt tròn phát sáng (glow node) trên trục dọc.
  * Hạt tròn của bản cập nhật mới nhất sử dụng màu hồng `{colors.primary}` (Rose 500), các bản cập nhật cũ hơn dùng màu tím `{colors.secondary}` hoặc xám Slate.
  * Các khối nội dung bản vá sử dụng `{components.card}` với hiệu ứng dịch chuyển khi hover (scale-up nhẹ 1.01x).
  * Tiêu đề bản vá dùng `{typography.title-lg}`, danh mục chi tiết dùng `{typography.body-md}`.
  * Hỗ trợ đầy đủ chế độ chuyển đổi song ngữ Anh/Việt tương ứng qua cookie ngữ cảnh.

## 8. PHẦN I: CHỢ ĐẤU GIÁ NÂNG CAO (ADVANCED AUCTIONS)
* **Giao diện Bot Discord:**
  * Hiển thị bảng danh sách phiên đấu giá hoạt động qua Embeds của Waguri (sử dụng màu `{colors.primary}` làm accent chính).
  * Lượt đấu giá mới nhất được đánh dấu nổi bật bằng tên thẻ Tag người chơi và số tiền bid.
  * Khi có người bị vượt giá (outbid), gửi cảnh báo DM trực tiếp dạng Embed màu đỏ hổ phách (`#E11D48`) để gây chú ý.

## 9. PHẦN J: THƯỞNG VAI TRÒ THEO CẤP (ROLE REWARDS)
* **Giao diện Bot & Server Support:**
  * Đồng bộ và gán tự động màu sắc vai trò và danh vị tương ứng theo cấp độ người chơi tại Discord Support Server.

---

## 10. PHẦN K: STATUS PAGE TRÊN WEB (v2.3)

### 10.1 Giao diện Trang Trạng Thái `/status`
* **Cơ chế kiểm tra trạng thái & Phân rã độ trễ (Detailed Latency Breakdown):**
  * **Discord Bot Gateway:** Truy vấn API `/stats` lấy thuộc tính `gatewayPing` (trích xuất an toàn từ `client.ws.ping` của bot, trả về `null` hoặc số dương thực tế).
  * **API Server:** Thực hiện cuộc gọi HTTP tới `{BOT_API}/`, tính toán khoảng thời gian từ lúc bắt đầu gửi tới lúc nhận dữ liệu làm thông số độ trễ API.
  * **Database (Supabase):** Chạy truy vấn client-side thử chọn 1 bản ghi từ bảng `items`, tính khoảng thời gian thực thi làm thông số độ trễ Database.
  * Phân loại màu sắc độ trễ: Xanh lá (`< 150ms` - Tốt), Vàng (`150ms - 500ms` - Chậm nhẹ), Đỏ (`> 500ms` hoặc lỗi - Ngoại tuyến).
* **Cơ chế Tự động tải lại (Auto-Refresh):**
  * Tích hợp nút gạt bật/tắt (Toggle Switch) cho trạng thái tự động tải lại.
  * Khi bật: Một bộ đếm ngược 30 giây chạy liên tục. Hiển thị thanh tiến trình (Countdown Progress Bar) co rút mượt mà bằng CSS transition (`transition-all duration-1000 linear`). Khi bộ đếm về 0, kích hoạt làm mới thông số tự động và khởi động lại vòng lặp.
  * Khi tắt hoặc trang bị ẩn (unmount): Giải phóng và hủy bỏ hoàn toàn các luồng đếm ngược tránh rò rỉ bộ nhớ (Memory Leak).
* **Bảo vệ chống Spam (Debounce Check):**
  * Nút "Làm mới thủ công" tự động khóa (`disabled`) trong 3 giây sau mỗi lần click để ngăn chặn hành vi click liên tục (Spamming) gây nghẽn API.
* **Bố cục giao diện (Layout):**
  * Tiêu đề chính dạng thẻ Card lớn `{components.card}` hiển thị tổng quan trạng thái hệ thống: "Tất cả hệ thống hoạt động tốt" (All Systems Operational) kèm nhịp đập phát sáng (glowing pulse).
  * Lưới grid 3 cột thông tin chi tiết (Discord Bot Gateway, Database, Cổng Thanh Toán).
  * Widget hiển thị thông số hiệu năng (Servers & Users) dạng đồng hồ số hoặc đồ họa hình cột mini.
  * Dòng biểu đồ thanh trạng thái mô phỏng 90 ngày gần nhất (Uptime bar) sử dụng màu xanh/tím để tạo điểm nhấn cao cấp.




-- ============================================================
-- 0156_users_locale_chosen.sql — Phân biệt ngôn ngữ "TỰ CHỌN" với ngôn ngữ "HỌC ĐƯỢC"
--
-- BỐI CẢNH (feedback 2026-10-21): người Việt để app Discord bằng tiếng Anh thì bot nói
-- tiếng Anh, và KHÔNG có cách nào tự đổi. Soi ra hai lỗi:
--   · `users.locale` (0110) chỉ được ghi MỘT LẦN — ở lần đầu người dùng gọi bot, từ
--     `interaction.locale`. Sau đó bậc "đã nhớ" luôn thắng bậc "app Discord", nên ngôn ngữ
--     của lần đầu bị KHOÁ VĨNH VIỄN, đổi app Discord cũng không ăn. Prod lúc soi: 25 người
--     khoá ở 'en', 243 ở 'vi', 794 chưa ghi.
--   · Không có lệnh cho người dùng tự chọn; chỉ admin đặt cả server (`/config language`,
--     3/28 server từng dùng).
--
-- SỬA: thêm cờ `locale_chosen`.
--   · false (mặc định) = `locale` là ngôn ngữ HỌC từ app Discord — được cập nhật lại mỗi khi
--     app đổi, và chỉ dùng cho đường prefix `w!` (đường đó không có tín hiệu từ Discord).
--   · true = người dùng TỰ CHỌN qua `/language` — thắng mọi tín hiệu khác, kể cả cấu hình
--     server, và tầng học KHÔNG được ghi đè.
-- Mọi hàng hiện có nhận false: 268 giá trị đang có đều là "học được", không ai từng chọn.
--
-- Idempotent.
-- ============================================================

alter table public.users
    add column if not exists locale_chosen boolean not null default false;

comment on column public.users.locale_chosen is
    'true = người dùng tự chọn locale qua /language (thắng cấu hình server); false = locale học từ app Discord.';

-- ============================================================
-- 0110_user_locale_nullable.sql — Cột ngôn ngữ người dùng (LÀM LẠI cho đúng)
--
-- 🟠 HIGH — tìm ra ở lượt quét lỗ hổng quy trình (spec: docs/spec-audit-process-gaps.md).
--
-- BỐI CẢNH: `0080_user_locale.sql` tồn tại trong repo từ lâu nhưng **CHƯA TỪNG ĐƯỢC ÁP**
-- lên prod lẫn test (kiểm ngày 2026-08-14: bảng `users` có 53 cột, không cột nào là
-- `locale`). "Viết migration" ≠ "DB đã có" — không gate nào bắt được khoảng hở này.
--
-- Hệ quả khi cột không tồn tại:
--   · `db.updateUserLocale()` chạy UPDATE vào cột không có -> lỗi bị catch nuốt, nơi gọi
--     lại `.catch(() => {})` => HỎNG HOÀN TOÀN IM LẶNG, ngôn ngữ không bao giờ được lưu
--   · `src/lib/prefixShim.js:112` đọc `userProfile?.locale || 'vi'` và đặt
--     `guildLocale: null` => MỌI lệnh prefix `w!` đều ra tiếng Việt, kể cả người dùng
--     tiếng Anh. Cột này là nguồn ngôn ngữ DUY NHẤT cho đường prefix.
--
-- VÌ SAO KHÔNG ÁP THẲNG 0080: file đó viết
--     ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'vi'
-- `NOT NULL DEFAULT 'vi'` khiến MỌI hàng lập tức có locale='vi', mà tầng i18n kiểm
-- `if (u?.locale)` -> luôn đúng -> KHOÁ CỨNG toàn bot về tiếng Việt và các bậc dự phòng
-- phía sau thành code chết. Áp nguyên bản sẽ hỏng NẶNG HƠN hiện trạng.
--
-- ĐÚNG: cột phải NULL được, KHÔNG default. `NULL` = "chưa biết ngôn ngữ của người này",
-- để chuỗi ưu tiên còn chạy tiếp xuống các bậc sau.
--
-- Migration này CỐ Ý sửa được cả trường hợp ai đó dựng lại DB từ đầu (chạy tuần tự nên
-- 0080 sẽ tạo cột sai trước): nó gỡ DEFAULT, gỡ NOT NULL, và đưa các giá trị 'vi' do
-- default tự điền về NULL — chỉ khi phát hiện đúng dấu vết của 0080.
--
-- Idempotent.
-- ============================================================

-- 1) Tạo cột nếu chưa có — nullable, KHÔNG default.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS locale text;

-- 2) Nếu DB nào đã lỡ áp 0080 (cột có DEFAULT 'vi'), hoàn nguyên cho đúng thiết kế.
DO $$
DECLARE
    v_default text;
    v_notnull boolean;
BEGIN
    SELECT column_default, (is_nullable = 'NO')
      INTO v_default, v_notnull
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'locale';

    -- Chỉ đưa 'vi' về NULL khi thấy ĐÚNG dấu vết của 0080 (có DEFAULT 'vi'). Không đụng
    -- DB nào mà 'vi' là lựa chọn thật của người dùng.
    IF v_default IS NOT NULL AND v_default LIKE '%vi%' THEN
        ALTER TABLE public.users ALTER COLUMN locale DROP DEFAULT;
        UPDATE public.users SET locale = NULL WHERE locale = 'vi';
        RAISE NOTICE '0110: đã gỡ DEFAULT ''vi'' và đưa các giá trị do default tự điền về NULL';
    END IF;

    IF v_notnull THEN
        ALTER TABLE public.users ALTER COLUMN locale DROP NOT NULL;
        RAISE NOTICE '0110: đã gỡ ràng buộc NOT NULL khỏi users.locale';
    END IF;
END $$;

-- 3) Chỉ nhận đúng 2 ngôn ngữ bot hỗ trợ. NULL vẫn hợp lệ (= chưa biết).
--    Chặn ngay tầng DB để không có đường nào ghi vào giá trị rác.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_locale_supported;
ALTER TABLE public.users ADD  CONSTRAINT users_locale_supported
    CHECK (locale IS NULL OR locale IN ('vi', 'en'));

COMMENT ON COLUMN public.users.locale IS
    'Ngôn ngữ đã học được của người dùng (vi|en). NULL = chưa biết -> tầng i18n rơi xuống bậc dự phòng. KHÔNG đặt default: default sẽ khoá cứng mọi người vào một thứ tiếng.';

-- ============================================================
-- VERIFY (đã chạy trên waguri-test rồi prod):
--   SELECT column_name, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name='users' AND column_name='locale';
--   -> is_nullable = 'YES', column_default = NULL
--
--   UPDATE users SET locale='en' WHERE user_id='<ai đó>';   -- chạy được
--   UPDATE users SET locale='xx' WHERE user_id='<ai đó>';   -- bị CHECK chặn
-- ============================================================

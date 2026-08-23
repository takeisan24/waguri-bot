-- ============================================================
-- 0133_premium_plans_canonical.sql — bảng giá Premium thành NGUỒN SỰ THẬT ở DB.
--
-- VÌ SAO: `create_premium_order(p_user, p_plan, p_months, p_amount)` nhận số tháng và số
-- tiền DO BÊN GỌI TRUYỀN VÀO, DB không kiểm gì cả. Mà bảng giá đang được chép tay ở HAI nơi
-- độc lập, hai ngôn ngữ khác nhau:
--
--     src/config/index.js      PREMIUM.PLANS     (bot Discord)
--     web/src/lib/premium.ts   PREMIUM_PLANS     (web)
--
-- Hôm nay hai bảng khớp nhau. Nhưng không có gì ngăn chúng lệch: sửa giá một bên rồi quên
-- bên kia là người dùng trả 25.000₫ mà nhận 6 tháng, hoặc trả 99.000₫ mà nhận 1 tháng. Đây
-- đúng là kiểu sai làm mất uy tín, vì nó xảy ra ĐÚNG LÚC người ta vừa đưa tiền.
--
-- Sửa: DB giữ bảng giá chuẩn và TỪ CHỐI mọi đơn không khớp. Bên gọi vẫn truyền months/amount
-- như cũ (không phải đổi mã), nhưng nay chúng bị đối chiếu.
--
-- Chọn thất bại RÕ RÀNG thay vì âm thầm: đơn lệch giá sẽ NÉM LỖI chứ không tự sửa. Tự sửa
-- nghĩa là người dùng thấy một giá trên màn hình và bị tính một giá khác — tệ hơn cả lỗi.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.premium_plans (
    plan     text PRIMARY KEY,
    months   int  NOT NULL CHECK (months > 0),
    amount   int  NOT NULL CHECK (amount > 0),
    con_ban  boolean NOT NULL DEFAULT true,   -- gói ngừng bán thì đặt false, KHÔNG xoá dòng
    sua_luc  timestamptz NOT NULL DEFAULT now()
);

-- Giá chuẩn, khớp với cả hai bảng trong mã tại thời điểm 2026-08-23.
INSERT INTO public.premium_plans (plan, months, amount) VALUES
    ('m1', 1, 25000),
    ('m3', 3, 60000),
    ('m6', 6, 99000)
ON CONFLICT (plan) DO UPDATE
    SET months = EXCLUDED.months, amount = EXCLUDED.amount, sua_luc = now();

ALTER TABLE public.premium_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.premium_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.premium_plans TO service_role;

-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_premium_order(p_user text, p_plan text, p_months integer, p_amount integer)
RETURNS premium_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_code text; v_row premium_orders; v_plan public.premium_plans;
BEGIN
    -- Đối chiếu với bảng giá chuẩn TRƯỚC KHI tạo đơn.
    SELECT * INTO v_plan FROM public.premium_plans WHERE plan = p_plan;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'goi khong ton tai: %', p_plan;
    END IF;
    IF NOT v_plan.con_ban THEN
        RAISE EXCEPTION 'goi % da ngung ban', p_plan;
    END IF;
    -- Chặn NULL riêng rồi so bằng `<>`, KHÔNG dùng `IS DISTINCT FROM`.
    --
    -- Lý do không phải thẩm mỹ: cổng vân tay schema_fingerprint() (0127) dò tham chiếu bảng
    -- bằng regex bắt mọi thứ đứng sau từ khoá FROM. Cụm `IS DISTINCT FROM v_plan.months`
    -- khiến nó tưởng `v_plan` là bảng không tồn tại và báo động giả. Viết tường minh vừa
    -- tránh điểm mù đó, vừa nói rõ NULL là đầu vào SAI chứ không phải "khác giá".
    IF p_months IS NULL OR p_amount IS NULL THEN
        RAISE EXCEPTION 'thieu so thang hoac so tien khi tao don goi %', p_plan;
    END IF;
    IF p_months <> v_plan.months OR p_amount <> v_plan.amount THEN
        RAISE EXCEPTION 'don lech gia: goi % phai la % thang / % dong, ben goi dua % thang / % dong',
            p_plan, v_plan.months, v_plan.amount, p_months, p_amount;
    END IF;

    LOOP
        v_code := 'WAGURI' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
        BEGIN
            INSERT INTO premium_orders (code, user_id, plan, months, amount)
            VALUES (v_code, p_user, p_plan, v_plan.months, v_plan.amount)
            RETURNING * INTO v_row;
            RETURN v_row;
        EXCEPTION WHEN unique_violation THEN
        END;
    END LOOP;
END $function$;

REVOKE ALL ON FUNCTION public.create_premium_order(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_premium_order(text, text, integer, integer) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- `grant_premium(user_id, days)` đang cho `anon` gọi (GRANT từ migration cũ).
--
-- Hôm nay CHƯA khai thác được: hàm là SECURITY INVOKER nên chạy bằng quyền người gọi, mà
-- anon không có quyền nào trên bảng `users` — thử thật dưới vai anon thì nhận
-- "permission denied for table users".
--
-- Nhưng nó chỉ cách MỘT lệnh GRANT là thành lỗ tự cấp Premium vĩnh viễn cho bất kỳ ai. Một
-- hàm tên "cấp Premium" thì không có lý do gì để mở ra Internet.
REVOKE ALL ON FUNCTION public.grant_premium(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_premium(text, integer) TO service_role;

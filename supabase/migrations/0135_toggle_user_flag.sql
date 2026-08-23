-- ============================================================
-- 0135_toggle_user_flag.sql — lật cờ người dùng NGUYÊN TỬ, thay cho đọc-rồi-ghi ở web.
--
-- VÌ SAO: `web/src/app/dashboard/actions.ts` có hai hàm bật/tắt viết y hệt nhau:
--
--     const { data } = await admin.from("users").select("profile_public")...   // bỏ `error`
--     const next = !((data?.profile_public ?? true) as boolean);
--     await admin.from("users").update({ profile_public: next })...
--
-- Đây KHÔNG chỉ là "nuốt lỗi" mà là GHI SAI DỮ LIỆU. Lệnh đọc hỏng một nhịp thì `data` là
-- null, `?? true` cho ra true, `next` thành false, và hồ sơ người dùng bị ghi thành ẨN —
-- bất kể trạng thái thật trước đó là gì. Người dùng không bấm gì sai, không thấy lỗi nào,
-- chỉ là quyền riêng tư của họ tự đổi.
--
-- Cùng lỗi ở `vote_reminder`: nhắc bỏ phiếu tự tắt.
--
-- Còn một nhánh nữa: `.single()` NÉM LỖI khi không khớp dòng nào. Người đăng nhập web mà
-- chưa từng dùng bot thì chưa có dòng trong `users` -> đọc lỗi -> ghi giá trị bịa -> lệnh
-- update khớp 0 dòng -> nút bấm không làm gì cả, im lặng.
--
-- Sửa tận gốc bằng một lệnh UPDATE duy nhất: không đọc trước, không có khoảng hở, không có
-- giá trị mặc định để đoán sai. Không khớp dòng nào thì NÉM LỖI để bên gọi biết.
--
-- Tên cột đi qua DANH SÁCH TRẮNG bằng IF/ELSIF chứ không nối chuỗi SQL động.
-- ============================================================

CREATE OR REPLACE FUNCTION public.toggle_user_flag(p_user text, p_flag text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_moi boolean;
BEGIN
    IF p_flag = 'profile_public' THEN
        UPDATE public.users SET profile_public = NOT COALESCE(profile_public, true)
         WHERE user_id = p_user
         RETURNING profile_public INTO v_moi;
    ELSIF p_flag = 'vote_reminder' THEN
        UPDATE public.users SET vote_reminder = NOT COALESCE(vote_reminder, true)
         WHERE user_id = p_user
         RETURNING vote_reminder INTO v_moi;
    ELSE
        RAISE EXCEPTION 'co khong hop le: %', p_flag;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'khong co nguoi dung %', p_user;
    END IF;
    RETURN v_moi;
END $function$;

REVOKE ALL ON FUNCTION public.toggle_user_flag(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_user_flag(text, text) TO service_role;

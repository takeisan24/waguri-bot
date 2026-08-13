-- ============================================================
-- 0101_pin_search_path_claim_ticket.sql
-- Chốt search_path cho `claim_ticket_atomic` (0093) — hàm SECURITY DEFINER duy nhất
-- còn hở sau khi 0098 vá `sell_item_market`.
--
-- VÌ SAO HỞ: migration `0055_security_harden_2.sql` chốt search_path cho MỌI hàm bằng một
-- khối DO chạy MỘT LẦN. Hàm tạo SAU 0055 không được nó bảo vệ. `claim_ticket_atomic` (0093)
-- và `sell_item_market` (0095) đều rơi vào khoảng trống này — gate `npm run check-sql`
-- (luật R2) nay bắt được lớp lỗi đó ngay lúc commit.
--
-- Rủi ro thấp (hàm chỉ service_role gọi được), nhưng SECURITY DEFINER không pin search_path
-- luôn là đường leo thang quyền: kẻ tấn công tạo object trùng tên ở schema khác trên đường
-- tìm kiếm của caller.
--
-- Tiện thể sửa một lỗi logic: điều kiện cũ
--   WHERE channel_id = ... AND (status = 'OPEN' OR claimed_by IS NULL)
-- khớp cả ticket đã CLOSED mà chưa ai nhận -> bấm "Nhận ticket" làm ticket đã đóng
-- SỐNG LẠI thành CLAIMED.
--
-- Idempotent.
-- ============================================================

-- Bọc IF EXISTS: bảng `tickets` (0093) chưa được áp lên DB test.
-- Migration phải chạy được trên MỌI môi trường -> no-op khi chưa có hệ thống ticket.
DO $$
BEGIN
    IF to_regclass('public.tickets') IS NULL THEN
        RAISE NOTICE '0101: bỏ qua — bảng public.tickets chưa tồn tại (migration 0093 chưa áp).';
        RETURN;
    END IF;

    EXECUTE $fn$
        CREATE OR REPLACE FUNCTION public.claim_ticket_atomic(p_channel_id TEXT, p_staff_id TEXT)
        RETURNS BOOLEAN
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, public
        AS $body$
        DECLARE
            v_updated INT;
        BEGIN
            UPDATE public.tickets
            SET status = 'CLAIMED', claimed_by = p_staff_id
            WHERE channel_id = p_channel_id
              AND status = 'OPEN'          -- CHỈ ticket đang mở (trước đây `OR claimed_by IS NULL`
              AND claimed_by IS NULL;      --  cho phép hồi sinh ticket đã CLOSED)
            GET DIAGNOSTICS v_updated = ROW_COUNT;
            RETURN v_updated > 0;
        END;
        $body$;
    $fn$;

    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.claim_ticket_atomic(TEXT, TEXT) FROM public, anon, authenticated';
    EXECUTE 'GRANT  EXECUTE ON FUNCTION public.claim_ticket_atomic(TEXT, TEXT) TO service_role';
END $$;

-- ============================================================
-- VERIFY:
-- SELECT proname, proconfig FROM pg_proc WHERE proname = 'claim_ticket_atomic';
--   -> proconfig phải chứa  search_path=pg_catalog, public
-- ============================================================

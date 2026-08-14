-- ============================================================
-- 0105_ledger_gdpr_erasure.sql — Dọn nhật ký giao dịch khi xoá người dùng
--
-- LỖ HỔNG DO CHÍNH 0104 TẠO RA (tự audit trước khi push mới thấy):
-- `delete_user_data()` (0075 — lệnh /deletedata, quyền xoá dữ liệu theo GDPR) và
-- `resetUser()` (database.js, /eco-admin resetuser) đều xoá 15+ bảng, nhưng KHÔNG
-- biết tới `economy_ledger` vì bảng đó mới có ở 0104.
-- => Người dùng bấm "xoá toàn bộ dữ liệu của tôi" nhưng toàn bộ lịch sử giao dịch
--    gắn với Discord ID của họ vẫn nằm nguyên trong DB.
--
-- Tệ hơn: cả hai đều có `DELETE FROM inventory`, câu đó KÍCH HOẠT trigger
-- `trg_log_item` và GHI THÊM dòng ledger mới cho đúng người vừa xin xoá — thao tác
-- xoá dữ liệu lại sinh ra dữ liệu cá nhân mới.
--
-- CÁCH SỬA — TRIGGER, KHÔNG SỬA HÀM NÀO:
-- Ban đầu tôi định viết lại `delete_user_data()` để thêm một câu DELETE. Khi đối
-- chiếu với bản gốc thì bản viết lại đó SAI 3 CHỖ và sẽ làm hỏng /deletedata:
--   · đổi RETURNS TEXT ('ok'/'blocked_loans') thành RETURNS JSONB — vỡ hợp đồng với bot
--   · dùng clans.owner_id trong khi cột thật là clans.leader_id — lỗi ngay khi chạy
--   · tự ý thêm SECURITY DEFINER
-- Đúng lớp lỗi "viết lại hàm đang chạy tốt" đã gây sự cố chợ 2026-08. Nên bỏ hướng đó.
--
-- AFTER DELETE ON users chạy SAU mọi DELETE con, nên dọn được cả những dòng ledger
-- vừa do trigger sinh ra trong lúc xoá. Và nó bao CẢ HAI đường xoá (RPC lẫn resetUser)
-- mà không đụng vào code nào của chúng.
--
-- Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION public.purge_ledger_on_user_delete()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    BEGIN
        DELETE FROM public.economy_ledger WHERE user_id = OLD.user_id;
    EXCEPTION WHEN OTHERS THEN
        -- Cùng nguyên tắc với 0104: ledger không bao giờ được chặn thao tác chính.
        NULL;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_ledger ON public.users;
CREATE TRIGGER trg_purge_ledger
    AFTER DELETE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.purge_ledger_on_user_delete();

REVOKE EXECUTE ON FUNCTION public.purge_ledger_on_user_delete() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_ledger_on_user_delete() TO service_role;

-- ============================================================
-- VERIFY:
--   INSERT INTO public.users(user_id, wallet) VALUES ('zz_gdpr', 100);
--   UPDATE public.users SET wallet = 200 WHERE user_id = 'zz_gdpr';       -- sinh ledger
--   INSERT INTO public.inventory(user_id,item_id,quantity) VALUES ('zz_gdpr','go',5);
--   SELECT count(*) FROM public.economy_ledger WHERE user_id='zz_gdpr';   -- kỳ vọng >= 2
--   SELECT public.delete_user_data('zz_gdpr');                            -- 'ok'
--   SELECT count(*) FROM public.economy_ledger WHERE user_id='zz_gdpr';   -- PHẢI = 0
-- ============================================================

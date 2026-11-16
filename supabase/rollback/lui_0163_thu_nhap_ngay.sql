-- ============================================================
-- lui_0163_thu_nhap_ngay.sql — ĐƯỜNG LÙI của 0163 (Lớp A). KHÔNG phải migration.
--
-- File này cố ý nằm NGOÀI supabase/migrations/ để không ai áp nhầm theo thứ tự số.
-- Khi cần lùi: chép nguyên văn thành migration số kế tiếp, áp waguri-test rồi mới prod.
--
-- ⚠️ CHỈ ĐƯỢC ÁP KHI CẢ HAI ĐIỀU SAU ĐỀU ĐÚNG:
--    1. Bot đang chạy với `config.WORK.BAND_MODE = 'off'` (đã deploy + restart). Ở 'log' /
--       'enforce' mọi lượt /work, /fish, /mine, /chop gọi hàm này; drop nó là đẩy tất cả
--       sang nhánh lỗi (mỗi lượt chỉ còn tối đa 400 xu).
--    2. CHƯA áp 0165, hoặc đã lùi 0165 xong (supabase/rollback/lui_0165_lop_b.sql).
--       Bản 0165 của hàm này gọi `ap_tran_lop_b`; lùi 0163 trước 0165 là sai thứ tự.
--
-- ⚠️ 'off' + không có Lớp A = đúng trạng thái lỗ trước khi sửa. Ghi lý do + thời điểm,
--    quay lại trong ≤ 24 giờ.
--
-- Hàng `daily_counters` khoá `thu_nhap_ngay` được GIỮ LẠI (vô hại, tự bị ghi đè khi sang
-- ngày); không xoá dữ liệu ở đây.
--
-- File tự thu quyền trước khi drop — không dựa vào trạng thái cũ. Idempotent.
-- ============================================================

DO $do$
BEGIN
    IF to_regprocedure('public.nhan_thu_nhap_chu_dong(text, bigint, text, text)') IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION public.nhan_thu_nhap_chu_dong(text, bigint, text, text)
            FROM public, anon, authenticated, service_role;
    END IF;
END
$do$;

DROP FUNCTION IF EXISTS public.nhan_thu_nhap_chu_dong(text, bigint, text, text);

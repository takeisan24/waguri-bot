-- ============================================================
-- 0114_ensure_rls_all_tables.sql — Bật RLS cho MỌI bảng public, không phụ thuộc thứ tự
--
-- PHÁT HIỆN NGAY LẦN CHẠY ĐẦU của `schema_fingerprint()` (0113): trên DB test, bảng
-- `user_study_sessions` **KHÔNG bật RLS**.
--
-- NGUYÊN NHÂN GỐC — một lỗ hổng THỨ TỰ, không phải lỗi đánh máy:
--   · `0094_study_system.sql` tạo bảng nhưng KHÔNG có `ENABLE ROW LEVEL SECURITY`
--   · Trên prod, bảng vẫn được bảo vệ nhờ event trigger `ensure_rls` bật giúp
--   · Trên test, tôi tạo bảng ở Đợt 2 TRƯỚC khi áp `0112` (file codify event trigger)
--     -> lúc tạo bảng chưa có ai bật giúp, và event trigger chỉ chạy khi CÓ DDL MỚI
--     -> bảng nằm đó không RLS mãi mãi
--
-- Bài học: dựa vào event trigger là dựa vào THỨ TỰ. Bảng tạo trước trigger thì không ai
-- bảo vệ. Cần một bước "quét lại toàn bộ" chạy được ở bất kỳ thời điểm nào.
--
-- Migration này không thay thế event trigger — nó bổ sung: trigger lo bảng TƯƠNG LAI,
-- migration này lo bảng ĐÃ CÓ. Chạy lại bao nhiêu lần cũng được.
--
-- Idempotent (ALTER ... ENABLE trên bảng đã bật là no-op).
-- ============================================================

DO $$
DECLARE
    r record;
    v_dem int := 0;
BEGIN
    FOR r IN
        SELECT c.relname
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
        RAISE NOTICE '0114: da bat RLS cho bang %', r.relname;
        v_dem := v_dem + 1;
    END LOOP;

    IF v_dem = 0 THEN
        RAISE NOTICE '0114: moi bang public deu da bat RLS san';
    END IF;
END $$;

-- ============================================================
-- VERIFY (cả prod lẫn test):
--   SELECT public.schema_fingerprint() -> 'bang_chua_bat_rls';
--   -> []
-- ============================================================

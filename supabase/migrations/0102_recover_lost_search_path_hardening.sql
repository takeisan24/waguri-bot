-- ============================================================
-- 0102_recover_lost_search_path_hardening.sql
-- KHÔI PHỤC nội dung của `0092_function_search_path_hardening.sql` — file này được viết
-- nhưng CHƯA BAO GIỜ được áp lên production.
--
-- VÌ SAO MẤT: có HAI file mang số `0092`
--     · 0092_user_profile_names.sql            -> đã áp ✅
--     · 0092_function_search_path_hardening.sql -> bị bỏ sót ❌
-- Đây là nạn nhân THỨ HAI của việc trùng số migration. Nạn nhân thứ nhất là
-- `0096_fix_market_item_ids.sql` (bị `0096_wealth_rank_and_bakery_privacy.sql` che),
-- và chính nó gây ra sự cố "bán mọi thứ 500 xu" mà 0098 vừa sửa.
--
-- BẰNG CHỨNG (Supabase security advisor + truy vấn pg_proc ngày 2026-08-13):
--     regen_energy / spend_energy / consume_item / sync_bakery_likes_count
--     -> proconfig = NULL  (search_path chưa pin)  => cảnh báo function_search_path_mutable
--
-- Hàm SECURITY DEFINER / hàm chạy dưới quyền cao mà không pin search_path có thể bị
-- "search_path hijacking": kẻ tấn công tạo object trùng tên ở schema khác trên đường tìm kiếm.
-- Pin cố định KHÔNG đổi hành vi.
--
-- ⚠️ BÀI HỌC: gate `npm run check-sql` (luật R1) nay chặn số migration trùng ngay lúc commit.
-- Hai sự cố sản xuất đã bắt nguồn từ đúng lỗi này.
--
-- Idempotent (ALTER FUNCTION ... SET chạy lại vô hại). Bọc IF EXISTS để chạy được trên DB test.
-- ============================================================

DO $$
DECLARE
    v_sig TEXT;
    v_sigs TEXT[] := ARRAY[
        'public.regen_energy(text)',
        'public.spend_energy(text, integer)',
        'public.consume_item(text, text)',
        'public.sync_bakery_likes_count()'
    ];
BEGIN
    FOREACH v_sig IN ARRAY v_sigs LOOP
        IF to_regprocedure(v_sig) IS NOT NULL THEN
            EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public', v_sig);
        ELSE
            RAISE NOTICE '0102: bỏ qua %s — hàm không tồn tại trên DB này.', v_sig;
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- VERIFY:
-- SELECT proname, proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public'
--   AND proname IN ('regen_energy','spend_energy','consume_item','sync_bakery_likes_count');
--   -> proconfig phải là {"search_path=pg_catalog, public"} cho CẢ BỐN, không còn NULL.
--
-- Sau đó chạy lại advisor: cảnh báo `function_search_path_mutable` phải về 0.
-- ============================================================

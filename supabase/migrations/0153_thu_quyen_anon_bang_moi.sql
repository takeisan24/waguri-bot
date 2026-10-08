-- ============================================================
-- 0153_thu_quyen_anon_bang_moi.sql — Thu quyền đọc công khai trên 2 bảng mới,
-- và cho DB tự soi lớp lỗi này (bảng, không phải RPC).
--
-- VÌ SAO CÓ: audit 2026-10-08. Hai bảng sinh ra ở 0149/0151 mang policy
-- `FOR SELECT` mở cho `anon, authenticated`:
--     · study_shop_catalog          (bảng giá tiệm tri thức)
--     · bakery_completed_orders     (user_id + lịch sử giao đơn của từng người)
-- Không có gì cần nó: `grep` toàn repo chỉ thấy `src/database.js` đọc hai bảng này,
-- và bot chạy bằng service_role. Web không chạm tới. Đây là policy chép tay từ khuôn
-- cũ, không phải nhu cầu thật.
--
-- MỨC ĐỘ THẬT: hiện `bakery_completed_orders` còn 0 dòng nên CHƯA lộ gì. Vá bây giờ
-- vì nó sẽ có dữ liệu ngay khi ai đó giao đơn VIP, và vì nó lệch khỏi tư thế đã siết
-- của mọi bảng khác (RLS bật, không policy, anon không có quyền nào).
--
-- VÌ SAO THÊM bang_mo_cho_anon(): cổng `check-rpc-anon.js` (0138) chỉ soi HÀM. Hai
-- bảng này mở suốt từ 11/09 và 21/09 mà không cổng nào kêu — chính Supabase advisor
-- phát hiện, không phải lưới của mình. Hàm này đóng đúng điểm mù đó, theo cùng cách
-- 0138 đã làm: HỎI THẲNG DB thay vì quét chữ trong migration, vì quyền trên bảng là
-- thứ Postgres/PostgREST âm thầm cấp, không phải thứ ta viết ra.
--
-- ĐỊNH NGHĨA "mở": có quyền DML cho anon/authenticated **VÀ** (RLS tắt **HOẶC** có
-- policy permissive cho vai đó). Chỉ GRANT mà RLS bật-không-policy thì mọi truy vấn
-- vẫn bị chặn sạch — đếm nó vào là báo động giả, đúng lớp sai mà audit trước đã mắc.
-- ============================================================

-- --- 1) Thu quyền trên 2 bảng ---------------------------------
DROP POLICY IF EXISTS "Allow public read on study_shop_catalog"      ON public.study_shop_catalog;
DROP POLICY IF EXISTS "Allow public read on bakery_completed_orders" ON public.bakery_completed_orders;

REVOKE ALL ON public.study_shop_catalog      FROM anon, authenticated;
REVOKE ALL ON public.bakery_completed_orders FROM anon, authenticated;

-- service_role (bot + web server) giữ nguyên toàn quyền.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_shop_catalog      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bakery_completed_orders TO service_role;

-- --- 2) Hàm soi để cổng CI hỏi thẳng DB -----------------------
CREATE OR REPLACE FUNCTION public.bang_mo_cho_anon()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
    SELECT coalesce(jsonb_agg(x ORDER BY x), '[]'::jsonb)
    FROM (
        SELECT c.relname || ' [' ||
               array_to_string(array_remove(ARRAY[
                   CASE WHEN has_table_privilege('anon', c.oid, 'SELECT')
                          OR has_table_privilege('authenticated', c.oid, 'SELECT') THEN 'SELECT' END,
                   CASE WHEN has_table_privilege('anon', c.oid, 'INSERT')
                          OR has_table_privilege('authenticated', c.oid, 'INSERT') THEN 'INSERT' END,
                   CASE WHEN has_table_privilege('anon', c.oid, 'UPDATE')
                          OR has_table_privilege('authenticated', c.oid, 'UPDATE') THEN 'UPDATE' END,
                   CASE WHEN has_table_privilege('anon', c.oid, 'DELETE')
                          OR has_table_privilege('authenticated', c.oid, 'DELETE') THEN 'DELETE' END
               ], NULL), ', ') ||
               CASE WHEN c.relrowsecurity THEN '] (policy permissive cho anon/authenticated)'
                    ELSE '] (RLS TẮT)' END AS x
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind = 'r'
           AND (has_table_privilege('anon', c.oid, 'SELECT')
             OR has_table_privilege('anon', c.oid, 'INSERT')
             OR has_table_privilege('anon', c.oid, 'UPDATE')
             OR has_table_privilege('anon', c.oid, 'DELETE')
             OR has_table_privilege('authenticated', c.oid, 'SELECT')
             OR has_table_privilege('authenticated', c.oid, 'INSERT')
             OR has_table_privilege('authenticated', c.oid, 'UPDATE')
             OR has_table_privilege('authenticated', c.oid, 'DELETE'))
           AND (
                NOT c.relrowsecurity
                OR EXISTS (
                     SELECT 1 FROM pg_policy pol
                      WHERE pol.polrelid = c.oid
                        AND pol.polpermissive
                        AND (pol.polroles = '{0}'::oid[]
                          OR 'anon'::regrole = ANY(pol.polroles)
                          OR 'authenticated'::regrole = ANY(pol.polroles))
                   )
           )
    ) s;
$function$;

REVOKE EXECUTE ON FUNCTION public.bang_mo_cho_anon() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bang_mo_cho_anon() TO service_role;

-- ============================================================
-- 0118_wealth_tax_scheduled.sql — Thuế tài sản không còn phụ thuộc việc điểm danh
--
-- LỖI CẤU TRÚC (không phải lỗi con số): thuế tài sản nằm BÊN TRONG `claim_daily`. Nghĩa là
-- người chơi **không bao giờ chạy `/daily` thì không bao giờ bị thu thuế**, dù giàu tới đâu.
-- Hệ thống đang THƯỞNG cho việc né một lệnh. Sai ở mọi quy mô kinh tế, nên sửa ngay theo
-- nguyên tắc của đợt 5 (docs/spec-dot-5-kinh-te.md §2).
--
-- CÁCH LÀM — cố ý KHÔNG sửa `claim_daily`:
-- Viết lại một RPC tiền đang chạy tốt là rủi ro không cần thiết (bài học từ vụ suýt viết
-- lại `delete_user_data` từ trí nhớ rồi sai 3 chi tiết). Thay vào đó, hàm chạy nền này
-- **bỏ qua ai đã điểm danh trong 24 giờ qua** — người dùng `/daily` vẫn đóng thuế qua
-- đường cũ VÀ VẪN THẤY dòng thông báo; người không dùng `/daily` nay bị hàm này thu.
-- Không ai bị thu hai lần, và không đụng một dòng nào của `claim_daily`.
--
-- Công thức sao chép NGUYÊN từ `claim_daily` để hai đường luôn khớp:
--     thuế = least(floor(greatest(0, ví+bank − 100.000) × 0,01), 50.000)
--     trừ bank trước, thiếu thì trừ tiếp ví
-- CỐ Ý KHÔNG đổi các con số này — chúng phụ thuộc quy mô, phải chờ dữ liệu thật (spec §5).
--
-- Người chơi KHÔNG được thông báo (quyết định của chủ repo): chỉ ghi vào `economy_ledger`
-- với nhãn `thue_tai_san`, truy được qua `/eco-admin trace`.
--
-- Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION public.charge_wealth_tax()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    c_threshold constant bigint := 100000;
    c_rate      constant numeric := 0.01;
    c_cap       constant bigint := 50000;
    v_so_nguoi  int := 0;
    v_tong      bigint := 0;
BEGIN
    -- Gắn nhãn cho trigger sổ nhật ký, nếu không mọi dòng sẽ mang tên hàm này thay vì
    -- một cái tên người đọc hiểu được.
    PERFORM set_config('app.ledger_source', 'thue_tai_san', true);

    WITH ung_vien AS (
        SELECT user_id, wallet, bank,
               least(floor(greatest(0, wallet + bank - c_threshold) * c_rate), c_cap)::bigint AS thue
          FROM public.users
         WHERE NOT COALESCE(exclude_from_economy, false)
           AND wallet + bank > c_threshold
           -- Ai vừa điểm danh thì đã đóng thuế qua `claim_daily` rồi -> bỏ qua, tránh thu 2 lần.
           AND (last_daily IS NULL OR last_daily < now() - interval '24 hours')
         FOR UPDATE
    ), da_thu AS (
        UPDATE public.users u
           SET bank   = greatest(0, u.bank - c.thue),
               -- bank/wallet ở vế phải đều là GIÁ TRỊ CŨ, nên tính được cả hai trong một lệnh.
               wallet = u.wallet - greatest(0, c.thue - u.bank)
          FROM ung_vien c
         WHERE u.user_id = c.user_id AND c.thue > 0
        RETURNING c.thue
    )
    SELECT count(*), COALESCE(sum(thue), 0) INTO v_so_nguoi, v_tong FROM da_thu;

    RETURN jsonb_build_object('status','ok','so_nguoi', v_so_nguoi, 'tong_thu', v_tong);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.charge_wealth_tax() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.charge_wealth_tax() TO service_role;

-- ============================================================
-- VERIFY (trên waguri-test):
--   -- người giàu CHƯA từng điểm danh -> PHẢI bị thu
--   INSERT INTO users(user_id, wallet, bank, last_daily) VALUES ('zz_giau', 200000, 0, NULL)
--     ON CONFLICT (user_id) DO UPDATE SET wallet=200000, bank=0, last_daily=NULL;
--   -- người giàu VỪA điểm danh -> PHẢI được bỏ qua
--   INSERT INTO users(user_id, wallet, bank, last_daily) VALUES ('zz_vua_dd', 200000, 0, now())
--     ON CONFLICT (user_id) DO UPDATE SET wallet=200000, bank=0, last_daily=now();
--   SELECT public.charge_wealth_tax();       -- -> so_nguoi = 1, tong_thu = 1000
--   SELECT user_id, wallet FROM users WHERE user_id LIKE 'zz_%';
--     -> zz_giau = 199000 (bị thu 1%×100.000) · zz_vua_dd = 200000 (nguyên)
-- ============================================================

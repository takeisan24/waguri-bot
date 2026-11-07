-- ============================================================
-- 0161_thue_tai_san_mot_lan_ngay.sql — Thuế tài sản thu ĐÚNG 1 lần / 24 giờ + hàm bồi hoàn
--
-- LỖI (đo trên prod 05/10 → 04/11, nhãn `thue_tai_san`): `index.js` gọi `charge_wealth_tax()`
-- 30 giây sau MỖI lần bot khởi động rồi mỗi 12 tiếng, mà hàm 0118 không nhớ lần thu trước.
-- Người giàu không `/daily` bị thu ~2 lần/ngày, cộng thêm một lần mỗi khi bot bật lại:
-- 520 lần thu, 13 người, 216/244 cặp (người, ngày) bị thu hơn 1 lần, nhiều nhất 4 lần/ngày.
-- Ý định của 0118 (sao chép công thức từ `claim_daily`) là 1 lần/24h.
--
-- CÁCH SỬA — khoá nguyên tử theo mốc ghi lại, NẰM TRONG chính hàm thu:
--   UPDATE job_runs SET last_run = now()
--    WHERE job = 'wealth_tax' AND last_run < now() - 24h RETURNING …
-- đứng ĐẦU hàm, cùng transaction với lệnh thu. Hai tiến trình gọi cùng lúc: bên thứ hai
-- chờ khoá dòng `wealth_tax`, rồi Postgres kiểm lại điều kiện trên bản mới → không khớp →
-- không thu. DB lỗi giữa chừng: mốc và lệnh thu cùng rollback.
--
-- "Đếm lại từ đầu" (chủ repo chốt 04-11): dòng mốc được tạo với `last_run = now()` →
-- lần thu kế tiếp sớm nhất 24 giờ sau khi áp. `ON CONFLICT DO NOTHING` nên chạy lại file
-- này KHÔNG đặt lại mốc.
--
-- Thiếu dòng mốc (ai đó xoá tay): KHÔNG tự tạo lại, KHÔNG thu (chủ repo chốt Q1), nhưng
-- trả `thieu_moc: true` để `index.js` báo kênh log — đó là lưới duy nhất cho biết thuế
-- đã ngừng thu. `status` vẫn là 'ok' (không thêm status mới mà cổng check-rpc-status
-- không canh được ở index.js).
--
-- KHÔNG đổi: công thức, ngưỡng 100.000, trần 50.000, việc bỏ qua người vừa `/daily`,
-- đường `claim_daily`. Thuộc tính hàm giữ nguyên như bản đang sống — ĐÃ ĐO trên prod
-- 07-11 (bài học 0158): prosecdef = true, proconfig = {search_path=pg_catalog, public},
-- proacl = {postgres=X, service_role=X}.
--
-- BỒI HOÀN: hàm `hoan_thue_lap(p_user_id, p_so_xu, p_dot)` cộng vào `bank`, chống hoàn
-- hai lần bằng khoá chính (dot, user_id) của bảng biên lai. Dữ liệu ai được hoàn bao
-- nhiêu KHÔNG nằm ở đây (repo công khai) — `scripts/hoan-thue-lap.js` đọc file JSON
-- riêng rồi gọi hàm. Hàm này cộng tiền số tuỳ ý → khoá quyền chỉ service_role, có trần
-- 1.100.000/lần, và sẽ bị XOÁ ở 0162 ngay sau khi hoàn xong (giữ bảng làm biên lai).
--
-- Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1) BẢNG MỐC CHẠY VIỆC NỀN
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_runs (
    job      TEXT        PRIMARY KEY,
    last_run TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_runs FROM anon, authenticated;
GRANT  ALL ON public.job_runs TO service_role;

COMMENT ON TABLE public.job_runs IS
    'Mốc lần chạy gần nhất của việc nền cần khoá nguyên tử (vd wealth_tax: 1 lần/24h). Không phải dữ liệu người chơi.';

INSERT INTO public.job_runs (job, last_run)
VALUES ('wealth_tax', now())
ON CONFLICT (job) DO NOTHING;

-- ------------------------------------------------------------
-- 2) THU THUẾ — khoá mốc đứng ĐẦU hàm
-- ------------------------------------------------------------
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
    -- KHOÁ: phải đứng trước lệnh thu. Không trả dòng nào = chưa đủ 24h, hoặc mất dòng mốc.
    UPDATE public.job_runs
       SET last_run = now()
     WHERE job = 'wealth_tax'
       AND last_run < now() - interval '24 hours';

    IF NOT FOUND THEN
        IF EXISTS (SELECT 1 FROM public.job_runs WHERE job = 'wealth_tax') THEN
            RETURN jsonb_build_object('status','ok','so_nguoi', 0, 'tong_thu', 0);
        END IF;
        -- Không tự tạo lại (chủ repo chốt Q1) — chỉ báo để người đọc log biết thuế đã ngừng.
        RETURN jsonb_build_object('status','ok','so_nguoi', 0, 'tong_thu', 0, 'thieu_moc', true);
    END IF;

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

-- ------------------------------------------------------------
-- 3) BIÊN LAI BỒI HOÀN — khoá chính (dot, user_id) chính là cái chống hoàn hai lần
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hoan_thue_lap_bien_lai (
    dot     TEXT        NOT NULL,
    user_id TEXT        NOT NULL,
    so_xu   BIGINT      NOT NULL CHECK (so_xu > 0),
    luc     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (dot, user_id)
);

ALTER TABLE public.hoan_thue_lap_bien_lai ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hoan_thue_lap_bien_lai FROM anon, authenticated;
GRANT  ALL ON public.hoan_thue_lap_bien_lai TO service_role;

COMMENT ON TABLE public.hoan_thue_lap_bien_lai IS
    'Biên lai hoàn thuế tài sản bị thu lặp (sự cố 05/10–11/2026). Giữ làm bằng chứng sau khi hàm hoan_thue_lap bị xoá (0162).';

-- ------------------------------------------------------------
-- 4) HOÀN THUẾ THU LẶP — dùng một lần, xoá ở 0162
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hoan_thue_lap(p_user_id TEXT, p_so_xu BIGINT, p_dot TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    c_tran   constant bigint := 1100000;   -- người nặng nhất ≈ 1.050.000; gõ nhầm thì bị chặn
    v_bank   bigint;
BEGIN
    IF p_user_id IS NULL OR btrim(p_user_id) = '' OR p_dot IS NULL OR btrim(p_dot) = '' THEN
        RETURN jsonb_build_object('status','tham_so_sai');
    END IF;
    IF p_so_xu IS NULL OR p_so_xu <= 0 OR p_so_xu > c_tran THEN
        RETURN jsonb_build_object('status','so_xu_sai');
    END IF;

    -- Khoá dòng người chơi trước. KHÔNG tự tạo dòng users: người đã /deletedata thì
    -- không hoàn, và cũng không để lại biên lai.
    PERFORM 1 FROM public.users WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status','khong_co_user');
    END IF;

    INSERT INTO public.hoan_thue_lap_bien_lai (dot, user_id, so_xu)
    VALUES (p_dot, p_user_id, p_so_xu)
    ON CONFLICT (dot, user_id) DO NOTHING;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status','already');
    END IF;

    PERFORM set_config('app.ledger_source', 'hoan_thue_lap', true);
    UPDATE public.users
       SET bank = bank + p_so_xu
     WHERE user_id = p_user_id
    RETURNING bank INTO v_bank;

    RETURN jsonb_build_object('status','ok','so_xu', p_so_xu, 'bank', v_bank);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hoan_thue_lap(TEXT, BIGINT, TEXT) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.hoan_thue_lap(TEXT, BIGINT, TEXT) TO service_role;

-- ============================================================
-- VERIFY (trên waguri-test):
--   SELECT * FROM job_runs;                         -- wealth_tax, last_run ≈ lúc áp
--   SELECT charge_wealth_tax();                     -- so_nguoi = 0 (chưa đủ 24h)
--   UPDATE job_runs SET last_run = now() - interval '25 hours' WHERE job = 'wealth_tax';
--   SELECT charge_wealth_tax();                     -- thu bình thường
--   SELECT charge_wealth_tax();                     -- so_nguoi = 0
--   SELECT hoan_thue_lap('zz_x', 1000, 'thu');      -- ok · gọi lại -> already
-- ============================================================

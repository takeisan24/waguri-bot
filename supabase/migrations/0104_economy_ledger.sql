-- ============================================================
-- 0104_economy_ledger.sql — Nhật ký giao dịch + sửa số liệu hoạt động
--
-- VẤN ĐỀ 1 — KHÔNG TRUY VẾT ĐƯỢC.
-- Bot không có bảng nhật ký giao dịch nào (`economy_snapshots` chỉ chụp tổng hợp
-- 12h/lần). Khi owner hỏi "tôi vừa bán 1 cuốc sắt, có đúng không?" thì câu trả lời
-- duy nhất là SUY LUẬN từ chênh lệch số dư — không tra được. Mọi tranh chấp kiểu
-- "tôi mất đồ" / "không nhận được tiền", và mọi điều tra exploit, đều bế tắc như vậy.
--
-- VẤN ĐỀ 2 — SỐ NGƯỜI HOẠT ĐỘNG SAI ~12 LẦN.
-- `snapshot_economy.active_7d` đếm theo `users.last_seen`, nhưng cột đó CHỈ được ghi
-- bởi `/daily` (src/commands/economy/daily.js:36 — chỗ duy nhất trong toàn repo).
-- Nên nó thực chất đo "số người bấm /daily", không phải người hoạt động.
--   last_seen      -> 3 người / 7 ngày
--   daily_counters -> 61 người / 7 ngày, 37 người riêng ngày 13/08
--
-- CÁCH LÀM — TRIGGER, KHÔNG SỬA RPC:
-- Ghi log bằng trigger trên `users` (wallet/bank) và `inventory` (quantity) thay vì
-- sửa ~20 RPC tiền. Lý do: viết lại 20 RPC đang chạy tốt CHÍNH LÀ cách sự cố chợ
-- 2026-08 xảy ra. Trigger bắt 100% mọi đường ghi (kể cả RPC viết sau này), chạy trong
-- cùng transaction nên nguyên tử, và không chạm một dòng nào của code hiện có.
--
-- NGUYÊN TẮC BẤT KHẢ XÂM PHẠM: ledger KHÔNG BAO GIỜ được làm hỏng giao dịch tiền.
-- Mọi lỗi ghi log đều bị nuốt (EXCEPTION WHEN OTHERS -> NULL). Mất một dòng log là
-- chấp nhận được; mất tiền của người chơi thì không.
--
-- Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1) BẢNG NHẬT KÝ
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.economy_ledger (
    id            BIGSERIAL PRIMARY KEY,
    user_id       TEXT        NOT NULL,
    kind          TEXT        NOT NULL,   -- 'wallet' | 'bank' | 'item'
    item_id       TEXT,                   -- chỉ có khi kind='item'
    delta         BIGINT      NOT NULL,   -- âm = mất, dương = nhận
    balance_after BIGINT,                 -- số dư/số lượng SAU thay đổi
    source        TEXT,                   -- tên RPC suy từ current_query() (best-effort)
    at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_user_at ON public.economy_ledger(user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_at      ON public.economy_ledger(at DESC);
-- Truy vết exploit: lọc nhanh các khoản nhận tiền lớn bất thường.
CREATE INDEX IF NOT EXISTS idx_ledger_big     ON public.economy_ledger(at DESC) WHERE delta > 100000;

ALTER TABLE public.economy_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.economy_ledger FROM anon, authenticated;
GRANT  ALL ON public.economy_ledger TO service_role;

COMMENT ON TABLE public.economy_ledger IS
    'Nhật ký mọi thay đổi tiền/vật phẩm, ghi tự động bằng trigger. Dùng cho /eco-admin trace & report. Dọn định kỳ bằng prune_economy_ledger().';

-- ------------------------------------------------------------
-- 2) SUY RA "NGUỒN" — tên RPC đang chạy
--    PostgREST gọi RPC dưới dạng `SELECT ... FROM "public"."ten_ham"(...)`, nên tách
--    được tên hàm từ current_query(). CHỈ lấy tên hàm, KHÔNG lưu câu lệnh thô
--    (tránh ghi cả tham số chứa dữ liệu người dùng vào log).
-- ------------------------------------------------------------
-- Lấy MỌI tên ứng viên trong câu lệnh rồi chỉ nhận cái nào THỰC SỰ là hàm trong
-- pg_proc. Bản đầu chỉ regex `public.xxx(` nên bắt nhầm TÊN BẢNG — một câu
-- `INSERT INTO public.users (...)` cho ra source='users', vô dụng cho truy vết.
CREATE OR REPLACE FUNCTION public.ledger_source()
RETURNS TEXT LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE q TEXT; cand TEXT;
BEGIN
    q := current_query();
    IF q IS NULL THEN RETURN NULL; END IF;

    -- Ưu tiên dạng PostgREST gọi RPC: SELECT "public"."ten_ham"(...)
    FOR cand IN
        SELECT (regexp_matches(q, '"?public"?\."?([a-z_][a-z0-9_]{2,40})"?\s*\(', 'g'))[1]
    LOOP
        IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = cand) THEN
            RETURN cand;
        END IF;
    END LOOP;

    -- Dự phòng: tên hàm không kèm schema
    FOR cand IN
        SELECT (regexp_matches(q, '\y([a-z_][a-z0-9_]{2,40})\s*\(', 'g'))[1]
    LOOP
        IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = cand) THEN
            RETURN cand;
        END IF;
    END LOOP;

    RETURN 'unknown';
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- ------------------------------------------------------------
-- 3) TRIGGER TIỀN — users.wallet / users.bank
--    Chỉ ghi khi số tiền THỰC SỰ đổi. Bot cập nhật `users` rất thường xuyên
--    (năng lượng, exp, máu, đồng bộ tên/avatar) nên phải lọc, không ghi bừa.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_money_change()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_src TEXT;
BEGIN
    IF NEW.wallet IS DISTINCT FROM OLD.wallet OR NEW.bank IS DISTINCT FROM OLD.bank THEN
        BEGIN
            v_src := public.ledger_source();
            IF NEW.wallet IS DISTINCT FROM OLD.wallet THEN
                INSERT INTO public.economy_ledger(user_id, kind, delta, balance_after, source)
                VALUES (NEW.user_id, 'wallet',
                        COALESCE(NEW.wallet, 0) - COALESCE(OLD.wallet, 0),
                        NEW.wallet, v_src);
            END IF;
            IF NEW.bank IS DISTINCT FROM OLD.bank THEN
                INSERT INTO public.economy_ledger(user_id, kind, delta, balance_after, source)
                VALUES (NEW.user_id, 'bank',
                        COALESCE(NEW.bank, 0) - COALESCE(OLD.bank, 0),
                        NEW.bank, v_src);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Ledger KHÔNG BAO GIỜ được làm hỏng giao dịch tiền.
            NULL;
        END;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_money ON public.users;
CREATE TRIGGER trg_log_money
    AFTER UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.log_money_change();

-- ------------------------------------------------------------
-- 4) TRIGGER VẬT PHẨM — inventory.quantity
--    Bỏ qua thay đổi độ bền (durability) — chỉ quan tâm số lượng.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_item_change()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_delta BIGINT; v_after BIGINT; v_user TEXT; v_item TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_delta := COALESCE(NEW.quantity, 0); v_after := NEW.quantity;
        v_user := NEW.user_id; v_item := NEW.item_id;
    ELSIF TG_OP = 'DELETE' THEN
        v_delta := -COALESCE(OLD.quantity, 0); v_after := 0;
        v_user := OLD.user_id; v_item := OLD.item_id;
    ELSE
        IF NEW.quantity IS NOT DISTINCT FROM OLD.quantity THEN RETURN NULL; END IF;
        v_delta := COALESCE(NEW.quantity, 0) - COALESCE(OLD.quantity, 0);
        v_after := NEW.quantity; v_user := NEW.user_id; v_item := NEW.item_id;
    END IF;

    IF v_delta = 0 THEN RETURN NULL; END IF;

    BEGIN
        INSERT INTO public.economy_ledger(user_id, kind, item_id, delta, balance_after, source)
        VALUES (v_user, 'item', v_item, v_delta, v_after, public.ledger_source());
    EXCEPTION WHEN OTHERS THEN
        NULL;  -- không bao giờ chặn thao tác kho vì lỗi ghi log
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_item ON public.inventory;
CREATE TRIGGER trg_log_item
    AFTER INSERT OR UPDATE OR DELETE ON public.inventory
    FOR EACH ROW EXECUTE FUNCTION public.log_item_change();

-- ------------------------------------------------------------
-- 5) DỌN RÁC — giữ ledger gọn cho free-tier
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_economy_ledger(p_days INT DEFAULT 30)
RETURNS BIGINT LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE n BIGINT;
BEGIN
    DELETE FROM public.economy_ledger WHERE at < now() - make_interval(days => GREATEST(p_days, 1));
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prune_economy_ledger(INT) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.prune_economy_ledger(INT) TO service_role;

-- ------------------------------------------------------------
-- 6) SỐ NGƯỜI HOẠT ĐỘNG THẬT — thay `last_seen` (chỉ /daily ghi)
--    Gộp mọi dấu vết có mốc thời gian đáng tin: daily_counters (chat/noitu/quest),
--    quest_progress, và ledger (từ nay trở đi).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.active_users(p_days INT DEFAULT 7)
RETURNS INT LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
    SELECT count(DISTINCT user_id)::int FROM (
        SELECT user_id FROM public.daily_counters WHERE day  > current_date - GREATEST(p_days, 1)
        UNION
        SELECT user_id FROM public.quest_progress WHERE quest_date > current_date - GREATEST(p_days, 1)
        UNION
        SELECT user_id FROM public.economy_ledger WHERE at > now() - make_interval(days => GREATEST(p_days, 1))
    ) s;
$$;

-- snapshot_economy: dùng active_users() thay vì last_seen.
CREATE OR REPLACE FUNCTION public.snapshot_economy()
RETURNS economy_snapshots LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE r economy_snapshots; v_active INT;
BEGIN
    v_active := public.active_users(7);
    INSERT INTO economy_snapshots AS es
        (taken_on, total_wallet, total_bank, total_supply, user_count, active_7d, premium_count, richest, avg_supply, taken_at)
    SELECT current_date,
           coalesce(sum(wallet), 0), coalesce(sum(bank), 0), coalesce(sum(wallet + bank), 0),
           count(*), v_active,
           count(*) FILTER (WHERE premium_until > now()),
           coalesce(max(wallet + bank), 0),
           coalesce((sum(wallet + bank) / nullif(count(*), 0))::bigint, 0),
           now()
    FROM users
    WHERE NOT coalesce(exclude_from_economy, false)
    ON CONFLICT (taken_on) DO UPDATE SET
        total_wallet = excluded.total_wallet, total_bank = excluded.total_bank,
        total_supply = excluded.total_supply, user_count = excluded.user_count,
        active_7d = excluded.active_7d, premium_count = excluded.premium_count,
        richest = excluded.richest, avg_supply = excluded.avg_supply, taken_at = excluded.taken_at
    RETURNING es.* INTO r;
    RETURN r;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.snapshot_economy() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.snapshot_economy() TO service_role;

-- ------------------------------------------------------------
-- 7) TRUY VẤN CHO BÁO CÁO
-- ------------------------------------------------------------

-- (a) Lịch sử giao dịch của MỘT người — trả lời đúng câu "tôi vừa bán cuốc sắt, có đúng không?"
CREATE OR REPLACE FUNCTION public.ledger_user(p_user TEXT, p_limit INT DEFAULT 20)
RETURNS TABLE(at TIMESTAMPTZ, kind TEXT, item_id TEXT, delta BIGINT, balance_after BIGINT, source TEXT)
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$
    SELECT l.at, l.kind, l.item_id, l.delta, l.balance_after, l.source
    FROM public.economy_ledger l
    WHERE l.user_id = p_user
    ORDER BY l.at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;
REVOKE EXECUTE ON FUNCTION public.ledger_user(TEXT, INT) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ledger_user(TEXT, INT) TO service_role;

-- (b) Ai nhận nhiều tiền nhất trong N giờ — phát hiện exploit
CREATE OR REPLACE FUNCTION public.ledger_top_gainers(p_hours INT DEFAULT 24, p_limit INT DEFAULT 10)
RETURNS TABLE(user_id TEXT, username TEXT, thu_vao BIGINT, chi_ra BIGINT, rong BIGINT, so_giao_dich BIGINT)
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$
    SELECT l.user_id,
           COALESCE(u.username, 'Người chơi'),
           sum(l.delta) FILTER (WHERE l.delta > 0),
           -sum(l.delta) FILTER (WHERE l.delta < 0),
           sum(l.delta),
           count(*)
    FROM public.economy_ledger l
    LEFT JOIN public.users u ON u.user_id = l.user_id
    WHERE l.kind IN ('wallet','bank')
      AND l.at > now() - make_interval(hours => GREATEST(p_hours, 1))
      AND NOT COALESCE(u.exclude_from_economy, false)
    GROUP BY l.user_id, u.username
    ORDER BY sum(l.delta) DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 25);
$$;
REVOKE EXECUTE ON FUNCTION public.ledger_top_gainers(INT, INT) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ledger_top_gainers(INT, INT) TO service_role;

-- (c) Vòi bơm tiền vs bể hút tiền theo nguồn — thấy ngay nguồn nào đang in tiền
CREATE OR REPLACE FUNCTION public.ledger_flow(p_hours INT DEFAULT 24, p_limit INT DEFAULT 12)
RETURNS TABLE(source TEXT, bom_vao BIGINT, hut_ra BIGINT, rong BIGINT, so_lan BIGINT)
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$
    SELECT COALESCE(l.source, 'unknown'),
           COALESCE(sum(l.delta) FILTER (WHERE l.delta > 0), 0),
           COALESCE(-sum(l.delta) FILTER (WHERE l.delta < 0), 0),
           sum(l.delta),
           count(*)
    FROM public.economy_ledger l
    LEFT JOIN public.users u ON u.user_id = l.user_id
    WHERE l.kind IN ('wallet','bank')
      AND l.at > now() - make_interval(hours => GREATEST(p_hours, 1))
      AND NOT COALESCE(u.exclude_from_economy, false)
    GROUP BY l.source
    ORDER BY abs(sum(l.delta)) DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 25);
$$;
REVOKE EXECUTE ON FUNCTION public.ledger_flow(INT, INT) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ledger_flow(INT, INT) TO service_role;

-- (d) Hoạt động theo ngày — thay con số active_7d hỏng
CREATE OR REPLACE FUNCTION public.activity_by_day(p_days INT DEFAULT 7)
RETURNS TABLE(ngay DATE, nguoi_hoat_dong INT)
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$
    SELECT d.day, count(DISTINCT d.user_id)::int
    FROM (
        SELECT day, user_id FROM public.daily_counters WHERE day > current_date - GREATEST(p_days, 1)
        UNION
        SELECT quest_date, user_id FROM public.quest_progress WHERE quest_date > current_date - GREATEST(p_days, 1)
        UNION
        SELECT at::date, user_id FROM public.economy_ledger WHERE at > now() - make_interval(days => GREATEST(p_days, 1))
    ) d(day, user_id)
    GROUP BY d.day ORDER BY d.day DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.activity_by_day(INT) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.activity_by_day(INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.active_users(INT) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.active_users(INT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ledger_source() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ledger_source() TO service_role;

-- ============================================================
-- VERIFY sau khi áp:
--   -- trigger đã gắn?
--   SELECT tgname, tgrelid::regclass FROM pg_trigger
--   WHERE tgname IN ('trg_log_money','trg_log_item');
--
--   -- thử một giao dịch rồi xem log (chạy trong transaction rồi ROLLBACK):
--   BEGIN;
--     UPDATE public.users SET wallet = wallet + 123 WHERE user_id = '<id>';
--     SELECT * FROM public.economy_ledger ORDER BY id DESC LIMIT 3;
--   ROLLBACK;
--
--   -- số người hoạt động THẬT (phải > 3):
--   SELECT public.active_users(7);
--   SELECT * FROM public.activity_by_day(10);
-- ============================================================

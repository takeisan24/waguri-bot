-- ============================================================
-- 0146_ma_qua.sql — Mã quà (redeem code)
--
-- Đặc tả: docs/spec-ma-qua.md
--
-- HÌNH DẠNG RỦI RO: hệ này giống hệt ba thứ đã hỏng và đã vá ở 0141/0144 — "đánh dấu đã
-- nhận" và "trao thưởng" là hai lời gọi rời nhau, bước hai hỏng thì mất thưởng vĩnh viễn.
-- Nên ở đây CHỈ CÓ MỘT hàm làm cả bốn việc trong một giao dịch: khoá -> kiểm -> ghi -> trao.
-- Không có đường nào từ JS chạm vào riêng lẻ từng bước.
--
-- TRẦN THƯỞNG (spec §4.1): cung tiền toàn bot ngày viết bản này là 907.554 xu. Một mã sơ ý
-- 100.000 xu x 200 lượt = 20 triệu = gấp 22 lần cả nền kinh tế, và KHÔNG hoàn tác được.
-- Trần đặt trong DB chứ không ở lệnh, vì lệnh thì bỏ qua được còn DB thì không.
-- ============================================================

-- ── 1. Hai bảng ─────────────────────────────────────────────────────────────────────
-- CASCADE về users: repo đang có 4 bảng mồ côi không có đường xoá (spec Backlog).
-- Không đẻ thêm cái thứ 5 — /deletedata phải dọn sạch được hai bảng này.
CREATE TABLE IF NOT EXISTS public.redeem_codes (
    code                 TEXT        PRIMARY KEY,
    rewards              JSONB       NOT NULL,        -- {coins, items:[{id,qty}], premium_days}
    max_uses             INT         NOT NULL DEFAULT 1,
    uses                 INT         NOT NULL DEFAULT 0,
    per_user_limit       INT         NOT NULL DEFAULT 1,
    only_user_id         TEXT,                        -- mã đền bù riêng cho một người
    starts_at            TIMESTAMPTZ,
    expires_at           TIMESTAMPTZ,
    min_account_age_days INT         NOT NULL DEFAULT 0,
    note                 TEXT        NOT NULL,        -- BẮT BUỘC: 6 tháng sau còn biết mã để làm gì
    created_by           TEXT,
    revoked              BOOLEAN     NOT NULL DEFAULT false,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.redeem_claims (
    id      BIGSERIAL   PRIMARY KEY,
    code    TEXT        NOT NULL REFERENCES public.redeem_codes(code) ON DELETE CASCADE,
    user_id TEXT        NOT NULL REFERENCES public.users(user_id)     ON DELETE CASCADE,
    at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_redeem_claims_code_user ON public.redeem_claims(code, user_id);
CREATE INDEX IF NOT EXISTS idx_redeem_claims_user      ON public.redeem_claims(user_id);

ALTER TABLE public.redeem_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redeem_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.redeem_codes  FROM anon, authenticated;
REVOKE ALL ON public.redeem_claims FROM anon, authenticated;

-- ── 2. Tuổi tài khoản Discord, suy từ chính ID ──────────────────────────────────────
-- Snowflake Discord: 42 bit đầu là mili-giây kể từ 2015-01-01. Suy từ ID nên KHÔNG giả
-- được — khác hẳn việc tin vào một tham số do người gọi truyền vào.
CREATE OR REPLACE FUNCTION public.discord_account_created(p_user TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $fn$
    SELECT CASE WHEN p_user ~ '^[0-9]{15,20}$'
        THEN to_timestamp((((p_user::BIGINT) >> 22) + 1420070400000) / 1000.0)
        ELSE NULL END;
$fn$;

-- ── 3. Tạo mã — nơi DUY NHẤT trần thưởng được canh ──────────────────────────────────
-- Trả: ok · exists · bad_code · bad_rewards · bad_window · over_cap_coins
--      · over_cap_total · over_cap_premium
CREATE OR REPLACE FUNCTION public.create_redeem_code(
    p_code TEXT, p_rewards JSONB, p_max_uses INT, p_per_user_limit INT,
    p_only_user TEXT, p_starts_at TIMESTAMPTZ, p_expires_at TIMESTAMPTZ,
    p_min_age_days INT, p_note TEXT, p_created_by TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
    -- Trần cứng. Nới thì phải qua migration mới — cố ý làm cho khó.
    c_max_coins_per_code CONSTANT BIGINT := 50000;
    c_max_coins_total    CONSTANT BIGINT := 500000;
    c_max_premium_days   CONSTANT INT    := 90;
    v_code  TEXT := upper(btrim(coalesce(p_code, '')));
    v_coins BIGINT;
    v_days  INT;
    v_item  JSONB;
BEGIN
    IF v_code !~ '^[A-Z0-9-]{4,32}$' THEN RETURN 'bad_code'; END IF;
    IF p_note IS NULL OR btrim(p_note) = '' THEN RETURN 'bad_rewards'; END IF;
    IF p_max_uses IS NULL OR p_max_uses < 1 THEN RETURN 'bad_rewards'; END IF;
    IF p_per_user_limit IS NULL OR p_per_user_limit < 1 THEN RETURN 'bad_rewards'; END IF;
    IF p_rewards IS NULL OR jsonb_typeof(p_rewards) <> 'object' THEN RETURN 'bad_rewards'; END IF;

    v_coins := COALESCE((p_rewards->>'coins')::BIGINT, 0);
    v_days  := COALESCE((p_rewards->>'premium_days')::INT, 0);
    IF v_coins < 0 OR v_days < 0 THEN RETURN 'bad_rewards'; END IF;

    -- Vật phẩm: kiểm từng món có thật + số lượng dương. Mã trỏ vào item không tồn tại thì
    -- người đổi sẽ nhận được "thành công" mà tay trắng — đúng lớp lỗi đang đi vá khắp repo.
    IF p_rewards ? 'items' THEN
        IF jsonb_typeof(p_rewards->'items') <> 'array' THEN RETURN 'bad_rewards'; END IF;
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_rewards->'items') LOOP
            IF COALESCE((v_item->>'qty')::INT, 0) < 1 THEN RETURN 'bad_rewards'; END IF;
            IF NOT EXISTS (SELECT 1 FROM items WHERE id = v_item->>'id') THEN
                RETURN 'bad_rewards';
            END IF;
        END LOOP;
    END IF;

    IF v_coins > c_max_coins_per_code           THEN RETURN 'over_cap_coins';   END IF;
    IF v_coins * p_max_uses > c_max_coins_total THEN RETURN 'over_cap_total';   END IF;
    IF v_days  > c_max_premium_days             THEN RETURN 'over_cap_premium'; END IF;

    IF p_starts_at IS NOT NULL AND p_expires_at IS NOT NULL AND p_expires_at <= p_starts_at THEN
        RETURN 'bad_window';
    END IF;
    IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN RETURN 'bad_window'; END IF;

    INSERT INTO redeem_codes (code, rewards, max_uses, per_user_limit, only_user_id,
                              starts_at, expires_at, min_account_age_days, note, created_by)
    VALUES (v_code, p_rewards, p_max_uses, p_per_user_limit,
            nullif(btrim(coalesce(p_only_user, '')), ''),
            p_starts_at, p_expires_at, GREATEST(COALESCE(p_min_age_days, 0), 0),
            btrim(p_note), p_created_by)
    ON CONFLICT (code) DO NOTHING;

    IF NOT FOUND THEN RETURN 'exists'; END IF;
    RETURN 'ok';
END; $fn$;

-- ── 4. Đổi mã — MỘT giao dịch, chín trạng thái ──────────────────────────────────────
-- Trả jsonb: {status, rewards}
-- status: ok · not_found · not_started · expired · used_up · already · not_for_you
--         · account_too_new · error
-- `revoked` cố ý trả 'not_found': không tiết lộ mã từng tồn tại.
CREATE OR REPLACE FUNCTION public.redeem_code_atomic(p_user TEXT, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
    v_code  TEXT := upper(btrim(coalesce(p_code, '')));
    r       redeem_codes%ROWTYPE;
    v_mine  INT;
    v_coins BIGINT;
    v_days  INT;
    v_item  JSONB;
    v_born  TIMESTAMPTZ;
BEGIN
    -- Nhãn cho economy_ledger. Không có nhãn thì lần sau nhìn cung tiền nhảy lại tưởng
    -- exploit — đã suýt báo động nhầm ba lần vì chuyện này.
    PERFORM set_config('app.ledger_source', 'redeem', true);

    IF v_code = '' THEN RETURN jsonb_build_object('status', 'not_found'); END IF;

    -- Khoá dòng mã: hai người đổi lượt cuối cùng cùng lúc phải xếp hàng, không cùng qua.
    SELECT * INTO r FROM redeem_codes WHERE code = v_code FOR UPDATE;
    IF NOT FOUND OR r.revoked THEN RETURN jsonb_build_object('status', 'not_found'); END IF;

    IF r.starts_at IS NOT NULL AND now() < r.starts_at THEN
        RETURN jsonb_build_object('status', 'not_started');
    END IF;
    IF r.expires_at IS NOT NULL AND now() >= r.expires_at THEN
        RETURN jsonb_build_object('status', 'expired');
    END IF;
    IF r.only_user_id IS NOT NULL AND r.only_user_id <> p_user THEN
        RETURN jsonb_build_object('status', 'not_for_you');
    END IF;

    IF r.min_account_age_days > 0 THEN
        v_born := discord_account_created(p_user);
        IF v_born IS NULL OR v_born > now() - make_interval(days => r.min_account_age_days) THEN
            RETURN jsonb_build_object('status', 'account_too_new');
        END IF;
    END IF;

    -- Đếm DƯỚI khoá dòng mã ở trên, nên không cần khoá riêng bảng claims.
    SELECT count(*) INTO v_mine FROM redeem_claims WHERE code = v_code AND user_id = p_user;
    IF v_mine >= r.per_user_limit THEN RETURN jsonb_build_object('status', 'already'); END IF;
    IF r.uses  >= r.max_uses      THEN RETURN jsonb_build_object('status', 'used_up'); END IF;

    -- Từ đây trở xuống là phần KHÔNG ĐƯỢC PHÉP tách: ghi nhận và trao nằm chung giao dịch.
    INSERT INTO users (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;

    UPDATE redeem_codes SET uses = uses + 1 WHERE code = v_code;
    INSERT INTO redeem_claims (code, user_id) VALUES (v_code, p_user);

    v_coins := COALESCE((r.rewards->>'coins')::BIGINT, 0);
    IF v_coins > 0 THEN
        UPDATE users SET wallet = wallet + v_coins WHERE user_id = p_user;
    END IF;

    IF r.rewards ? 'items' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(r.rewards->'items') LOOP
            INSERT INTO inventory (user_id, item_id, quantity)
            VALUES (p_user, v_item->>'id', (v_item->>'qty')::INT)
            ON CONFLICT (user_id, item_id) DO UPDATE
                SET quantity = inventory.quantity + excluded.quantity;
        END LOOP;
    END IF;

    v_days := COALESCE((r.rewards->>'premium_days')::INT, 0);
    IF v_days > 0 THEN
        UPDATE users
           SET premium_until = GREATEST(COALESCE(premium_until, now()), now())
                               + make_interval(days => v_days)
         WHERE user_id = p_user;
    END IF;

    RETURN jsonb_build_object('status', 'ok', 'rewards', r.rewards);
END; $fn$;

-- ── 5. Thu hồi mã ───────────────────────────────────────────────────────────────────
-- Trả: ok · not_found
CREATE OR REPLACE FUNCTION public.revoke_redeem_code(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
    UPDATE redeem_codes SET revoked = true
     WHERE code = upper(btrim(coalesce(p_code, ''))) AND revoked = false;
    IF NOT FOUND THEN RETURN 'not_found'; END IF;
    RETURN 'ok';
END; $fn$;

-- ── 6. Khoá cửa ─────────────────────────────────────────────────────────────────────
-- Postgres tự cấp PUBLIC EXECUTE cho hàm mới. Không REVOKE là ai cầm khoá công khai cũng
-- tự tạo mã cho mình 50k xu — đúng lỗ đã vá ở 0137/0138.
REVOKE ALL ON FUNCTION public.create_redeem_code(TEXT, JSONB, INT, INT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_code_atomic(TEXT, TEXT)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_redeem_code(TEXT)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discord_account_created(TEXT)    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_redeem_code(TEXT, JSONB, INT, INT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_code_atomic(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_redeem_code(TEXT)       TO service_role;
GRANT EXECUTE ON FUNCTION public.discord_account_created(TEXT)  TO service_role;

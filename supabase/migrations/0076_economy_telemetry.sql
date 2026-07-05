-- ============================================================
-- 0076_economy_telemetry.sql — Telemetry kinh tế (ảnh chụp tổng cung tiền/ngày)
-- ------------------------------------------------------------
-- Mục đích: theo dõi lạm phát & phát hiện exploit khi bot public (cung tiền tăng bất thường).
-- Cách tiếp cận: ảnh chụp TỔNG HỢP mỗi ngày (không log từng giao dịch → không đụng hot-path tiền).
-- 1 dòng/ngày (upsert theo taken_on). RPC service_role-only.
-- ============================================================

CREATE TABLE IF NOT EXISTS economy_snapshots (
    taken_on      DATE PRIMARY KEY,
    total_wallet  BIGINT      NOT NULL DEFAULT 0,
    total_bank    BIGINT      NOT NULL DEFAULT 0,
    total_supply  BIGINT      NOT NULL DEFAULT 0,   -- ví + ngân hàng toàn hệ thống
    user_count    INTEGER     NOT NULL DEFAULT 0,
    active_7d     INTEGER     NOT NULL DEFAULT 0,   -- user có last_seen trong 7 ngày
    premium_count INTEGER     NOT NULL DEFAULT 0,
    richest       BIGINT      NOT NULL DEFAULT 0,   -- số dư (ví+bank) lớn nhất
    avg_supply    BIGINT      NOT NULL DEFAULT 0,
    taken_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE economy_snapshots ENABLE ROW LEVEL SECURITY; -- service_role (bot) bỏ qua RLS; chặn anon

-- Chụp nhanh kinh tế hôm nay (upsert). Trả về dòng snapshot.
CREATE OR REPLACE FUNCTION snapshot_economy()
RETURNS economy_snapshots LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE r economy_snapshots;
BEGIN
    INSERT INTO economy_snapshots AS es
        (taken_on, total_wallet, total_bank, total_supply, user_count, active_7d, premium_count, richest, avg_supply, taken_at)
    SELECT current_date,
           coalesce(sum(wallet), 0),
           coalesce(sum(bank), 0),
           coalesce(sum(wallet + bank), 0),
           count(*),
           count(*) FILTER (WHERE last_seen > now() - interval '7 days'),
           count(*) FILTER (WHERE premium_until > now()),
           coalesce(max(wallet + bank), 0),
           coalesce((sum(wallet + bank) / nullif(count(*), 0))::bigint, 0),
           now()
    FROM users
    ON CONFLICT (taken_on) DO UPDATE SET
        total_wallet  = excluded.total_wallet,
        total_bank    = excluded.total_bank,
        total_supply  = excluded.total_supply,
        user_count    = excluded.user_count,
        active_7d     = excluded.active_7d,
        premium_count = excluded.premium_count,
        richest       = excluded.richest,
        avg_supply    = excluded.avg_supply,
        taken_at      = excluded.taken_at
    RETURNING es.* INTO r;
    RETURN r;
END;
$$;

REVOKE EXECUTE ON FUNCTION snapshot_economy() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION snapshot_economy() TO service_role;

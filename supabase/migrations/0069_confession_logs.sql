-- ============================================================
-- 0069_confession_logs.sql — Lưu vết confession để admin kiểm tra quấy rối
-- ============================================================
CREATE TABLE IF NOT EXISTS confession_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id        TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    confession_num  INT NOT NULL,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảo mật RLS: chỉ service_role được truy cập
ALTER TABLE confession_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_access ON confession_logs FOR ALL TO service_role USING (true);

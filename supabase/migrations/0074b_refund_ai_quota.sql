-- ============================================================
-- 0074b_refund_ai_quota.sql — RPC hoàn trả quota AI hằng ngày
-- ============================================================

-- RPC hoàn lại 1 lượt quota AI hằng ngày nếu API sập hoặc timeout
CREATE OR REPLACE FUNCTION refund_ai_quota(p_user_id TEXT)
RETURNS VOID LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    UPDATE users 
    SET ai_used = greatest(0, ai_used - 1)
    WHERE user_id = p_user_id AND ai_used_date = current_date;
END;
$$;

REVOKE EXECUTE ON FUNCTION refund_ai_quota(TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION refund_ai_quota(TEXT) TO service_role;

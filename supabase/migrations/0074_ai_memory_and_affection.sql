-- ============================================================
-- 0074_ai_memory_and_affection.sql — Thêm cột ai_memory và RPC cập nhật ký ức
-- ============================================================

-- Thêm cột lưu trữ ký ức dạng JSONB vào bảng users
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_memory JSONB NOT NULL DEFAULT '{}';

-- RPC cập nhật ký ức Waguri nguyên tử (3 tham số)
CREATE OR REPLACE FUNCTION update_ai_memory(
    p_user_id TEXT,
    p_key TEXT,
    p_value TEXT
)
RETURNS JSONB LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_memory JSONB;
BEGIN
    INSERT INTO users (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    
    UPDATE users 
    SET ai_memory = jsonb_set(coalesce(ai_memory, '{}'::jsonb), array[p_key], to_jsonb(p_value), true)
    WHERE user_id = p_user_id
    RETURNING ai_memory INTO v_memory;
    
    RETURN v_memory;
END;
$$;

-- Sửa chữ ký khớp đúng 3 tham số đầu vào
REVOKE EXECUTE ON FUNCTION update_ai_memory(TEXT, TEXT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_ai_memory(TEXT, TEXT, TEXT) TO service_role;

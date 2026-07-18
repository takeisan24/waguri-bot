-- ============================================================
-- 0090_claim_support_gift_ensure_row.sql — F2: chặn "báo thành công nhưng KHÔNG cộng tiền".
--
--   Bản 0085: /claim-support gọi RPC mà KHÔNG tạo dòng user trước (chỉ gác điều kiện là
--   thành viên Server Support). Nếu user đã vào server nhưng CHƯA từng dùng bot, dòng
--   trong `users` chưa tồn tại: `SELECT ... FOR UPDATE` trả NULL (không khoá được gì),
--   `UPDATE users ... WHERE user_id = user_id_p` khớp 0 dòng, rồi hàm VẪN `RETURN true`
--   -> lệnh hiện "đã nhận +10.000 xu" trong khi ví không hề tăng và cờ claimed không được
--   ghi (nên lần sau vẫn "chưa nhận"). Vừa lừa người dùng vừa để lộ đường spam thông báo.
--
--   Vá:
--     1) INSERT ... ON CONFLICT DO NOTHING -> đảm bảo dòng user tồn tại để khoá & cộng tiền.
--     2) GET DIAGNOSTICS row-count trên UPDATE -> chỉ RETURN true khi thực sự cộng được;
--        0 dòng (bất khả kháng) -> RETURN false để lệnh báo lỗi thay vì báo thành công dối.
--   Giữ nguyên chữ ký/SECURITY DEFINER/search_path/grants.
-- ============================================================
CREATE OR REPLACE FUNCTION claim_support_gift(user_id_p TEXT, reward_coins_p BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    claimed BOOLEAN;
    v_upd INT;
BEGIN
    -- (1) Đảm bảo dòng user tồn tại (user có thể vào Support Server mà chưa từng dùng bot).
    INSERT INTO users(user_id) VALUES(user_id_p) ON CONFLICT (user_id) DO NOTHING;

    -- Khóa dòng (Row Locking) để tránh race condition
    SELECT claimed_support_gift INTO claimed
    FROM users
    WHERE user_id = user_id_p
    FOR UPDATE;

    IF COALESCE(claimed, false) = true THEN
        RETURN false;
    END IF;

    UPDATE users
    SET claimed_support_gift = true, wallet = wallet + reward_coins_p
    WHERE user_id = user_id_p;

    -- (2) Chỉ báo thành công khi thực sự cộng được tiền.
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd = 0 THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_support_gift(TEXT, BIGINT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_support_gift(TEXT, BIGINT) TO service_role;

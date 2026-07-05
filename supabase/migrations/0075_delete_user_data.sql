-- ============================================================
-- 0075_delete_user_data.sql — GDPR: xoá dữ liệu cá nhân của một người dùng
-- ------------------------------------------------------------
-- Chặn nếu còn nghĩa vụ chéo: khoản vay ACTIVE (bên vay/bên cho vay) hoặc đang là CHỦ clan.
-- GIỮ LẠI theo lợi ích hợp pháp: premium_orders (đối soát thanh toán) + confession_logs (điều tra quấy rối).
-- Xoá con trước, users sau (tránh vi phạm khoá ngoại). Hàm nguyên tử (1 transaction).
-- ============================================================

CREATE OR REPLACE FUNCTION delete_user_data(p_user_id TEXT)
RETURNS TEXT LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Chặn: còn khoản vay chưa tất toán (là bên vay HOẶC bên cho vay)
    IF EXISTS (SELECT 1 FROM loans WHERE status = 'active' AND (lender_id = p_user_id OR borrower_id = p_user_id)) THEN
        RETURN 'blocked_loans';
    END IF;
    -- Chặn: đang là chủ (leader) của một clan
    IF EXISTS (SELECT 1 FROM clans WHERE leader_id = p_user_id) THEN
        RETURN 'blocked_clan_leader';
    END IF;

    -- Gỡ liên kết bạn đời để không để lại tham chiếu treo ở phía người kia
    UPDATE users SET partner_id = NULL, married_at = NULL WHERE partner_id = p_user_id;

    -- Xoá dữ liệu chơi cá nhân (con trước — inventory/cooldowns/police_heat có FK tới users)
    DELETE FROM inventory       WHERE user_id = p_user_id;
    DELETE FROM cooldowns       WHERE user_id = p_user_id;
    DELETE FROM police_heat     WHERE user_id = p_user_id;
    DELETE FROM quest_progress  WHERE user_id = p_user_id;
    DELETE FROM achievements    WHERE user_id = p_user_id;
    DELETE FROM user_pets       WHERE user_id = p_user_id;
    DELETE FROM pigs            WHERE user_id = p_user_id;
    DELETE FROM plants          WHERE user_id = p_user_id;
    DELETE FROM bakeries        WHERE user_id = p_user_id;
    DELETE FROM daily_counters  WHERE user_id = p_user_id;
    DELETE FROM guild_members   WHERE user_id = p_user_id;
    DELETE FROM lottery_tickets WHERE user_id = p_user_id;
    DELETE FROM game_stakes     WHERE user_id = p_user_id;
    DELETE FROM market_listings WHERE seller_id = p_user_id;

    -- GIỮ LẠI (lợi ích hợp pháp): premium_orders (đối soát), confession_logs (điều tra abuse)

    DELETE FROM users WHERE user_id = p_user_id;

    RETURN 'ok';
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_user_data(TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_user_data(TEXT) TO service_role;

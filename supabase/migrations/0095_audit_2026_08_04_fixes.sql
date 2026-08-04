-- ============================================================
-- 0095_audit_2026_08_04_fixes.sql — Sửa lỗi từ đợt audit sâu 2026-08-04
--
-- Gồm:
--  1) 🔴 complete_study_session: sửa cột KHÔNG TỒN TẠI (id -> user_id, coins -> wallet).
--     Bảng users chỉ có user_id/wallet/bank/job_id/exp... (KHÔNG có `id`/`coins`), nên RPC cũ
--     RAISE "column does not exist" MỖI lần gọi -> rollback -> user KHÔNG được cộng thưởng
--     nhưng bot vẫn báo "thành công" (false-success). Đây là fix quan trọng nhất.
--  2) 🟠 market_list: thêm FOR UPDATE + guard `quantity >= p_qty` + row-count (port từ 0089
--     auction_create). Trước đây read-then-write không khoá -> spam `/market list` đồng thời
--     nhân bản vật phẩm (2 listing ký gửi 10 item chỉ backed bởi 5 thật, inventory âm).
--  3) 🟡 leaderboard_rows / leaderboard_rows_guild: tôn trọng cờ `profile_public` (riêng tư).
--     Trước đây user để hồ sơ ẩn vẫn lên BXH công khai kèm ID/tên/avatar/tài sản.
--  4) 🟢 increment_pet_skill_points: cộng điểm kỹ năng pet NGUYÊN TỬ (thay read-modify-write
--     ở database.js addPetSkillPoints bị lost-update khi cấp điểm đồng thời).
--  5) 🟢 game_stakes UNIQUE(session_id,user_id) + stake_collect đặt chỗ trước khi trừ ví ->
--     chống double-join thu cược 2 lần (loto/bingo/masoi/duangua/xocdia) khi bấm/gửi nhanh.
-- ============================================================

-- ------------------------------------------------------------
-- 1) STUDY: sửa cột users (id -> user_id, coins -> wallet)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_study_session(
    p_session_id BIGINT,
    p_user_id TEXT,
    p_earned_coins BIGINT,
    p_earned_exp BIGINT,
    p_study_points INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session RECORD;
    v_last_date DATE;
    v_today DATE := CURRENT_DATE;
    v_new_streak INT := 1;
BEGIN
    -- 1. Kiểm tra phiên tồn tại & đang ACTIVE (khoá dòng)
    SELECT * INTO v_session
    FROM public.user_study_sessions
    WHERE id = p_session_id AND user_id = p_user_id AND status = 'ACTIVE'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_found_or_inactive');
    END IF;

    -- 2. Đánh dấu phiên hoàn thành
    UPDATE public.user_study_sessions
    SET status = 'COMPLETED',
        earned_coins = p_earned_coins,
        earned_exp = p_earned_exp,
        study_points = p_study_points
    WHERE id = p_session_id;

    -- 3. Tính chuỗi chuyên cần (đọc từ đúng cột user_id)
    SELECT last_study_date, study_streak INTO v_last_date, v_new_streak
    FROM public.users
    WHERE user_id = p_user_id;

    IF v_last_date IS NULL THEN
        v_new_streak := 1;
    ELSIF v_last_date = v_today THEN
        v_new_streak := COALESCE(v_new_streak, 1);
    ELSIF v_last_date = v_today - INTERVAL '1 day' THEN
        v_new_streak := COALESCE(v_new_streak, 0) + 1;
    ELSE
        v_new_streak := 1;
    END IF;

    -- 4. Cộng thưởng & thống kê học tập NGUYÊN TỬ (wallet thay cho coins, user_id thay cho id)
    UPDATE public.users
    SET wallet = wallet + p_earned_coins,
        exp = exp + p_earned_exp,
        study_points = COALESCE(study_points, 0) + p_study_points,
        total_study_minutes = COALESCE(total_study_minutes, 0) + v_session.duration_minutes,
        study_streak = v_new_streak,
        last_study_date = v_today
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_streak', v_new_streak,
        'earned_coins', p_earned_coins,
        'earned_exp', p_earned_exp,
        'study_points', p_study_points
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_study_session(BIGINT, TEXT, BIGINT, BIGINT, INT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_study_session(BIGINT, TEXT, BIGINT, BIGINT, INT) TO service_role;

-- ------------------------------------------------------------
-- 2) MARKET: đăng bán nguyên tử (FOR UPDATE + guard + row-count)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.market_list(p_seller text, p_item text, p_qty int, p_price bigint)
RETURNS jsonb LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE v_have int; v_id bigint; v_upd int;
BEGIN
    IF p_qty <= 0 THEN RETURN jsonb_build_object('status','bad_qty'); END IF;

    -- Khoá dòng kho của (người bán, vật phẩm) trước khi kiểm tra & trừ.
    SELECT coalesce(quantity,0) INTO v_have
        FROM inventory WHERE user_id = p_seller AND item_id = p_item FOR UPDATE;
    IF coalesce(v_have,0) < p_qty THEN RETURN jsonb_build_object('status','poor_item'); END IF;

    -- Trừ có điều kiện + kiểm tra row-count: quyết định & mutate trong CÙNG câu lệnh.
    UPDATE inventory SET quantity = quantity - p_qty
        WHERE user_id = p_seller AND item_id = p_item AND quantity >= p_qty;
    GET DIAGNOSTICS v_upd = row_count;
    IF v_upd = 0 THEN RETURN jsonb_build_object('status','poor_item'); END IF;

    DELETE FROM inventory WHERE user_id = p_seller AND item_id = p_item AND quantity <= 0;
    INSERT INTO market_listings(seller_id, item_id, qty, price)
        VALUES (p_seller, p_item, p_qty, p_price) RETURNING id INTO v_id;
    RETURN jsonb_build_object('status','ok','id', v_id);
END; $$;

-- ------------------------------------------------------------
-- 3) LEADERBOARD: tôn trọng profile_public (chỉ liệt kê hồ sơ công khai)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leaderboard_rows(p_sort text, p_limit int)
RETURNS TABLE(user_id text, networth bigint, exp int, username text, avatar text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT user_id, (wallet + bank)::bigint AS networth, exp, COALESCE(username, 'Người chơi') AS username, avatar
    FROM public.users
    WHERE COALESCE(profile_public, true)
    ORDER BY CASE WHEN p_sort = 'level' THEN exp::bigint ELSE (wallet + bank) END DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.leaderboard_rows_guild(p_sort text, p_limit int, p_guild text)
RETURNS TABLE(user_id text, networth bigint, exp int, username text, avatar text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT u.user_id, (u.wallet + u.bank)::bigint AS networth, u.exp, COALESCE(u.username, 'Người chơi') AS username, u.avatar
    FROM public.users u
    JOIN public.guild_members gm ON gm.user_id = u.user_id AND gm.guild_id = p_guild
    WHERE COALESCE(u.profile_public, true)
    ORDER BY CASE WHEN p_sort = 'level' THEN u.exp::bigint ELSE (u.wallet + u.bank) END DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.leaderboard_rows(text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leaderboard_rows_guild(text, int, text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 4) PET SKILL POINTS: cộng nguyên tử (chống lost-update)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_pet_skill_points(p_user text, p_points int)
RETURNS int LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE v_new int;
BEGIN
    UPDATE public.user_pets
      SET skill_points = COALESCE(skill_points, 0) + p_points
      WHERE user_id = p_user
      RETURNING skill_points INTO v_new;
    RETURN v_new;  -- NULL nếu user chưa có pet
END; $$;

REVOKE EXECUTE ON FUNCTION public.increment_pet_skill_points(text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_pet_skill_points(text, int) TO service_role;

-- ------------------------------------------------------------
-- 5) GAME STAKES: chống double-join thu cược 2 lần
-- ------------------------------------------------------------
-- Gỡ dòng trùng (session_id,user_id) còn sót (nếu có) trước khi thêm ràng buộc UNIQUE.
DELETE FROM public.game_stakes a
    USING public.game_stakes b
    WHERE a.id > b.id AND a.session_id = b.session_id AND a.user_id = b.user_id;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_game_stakes_session_user'
    ) THEN
        ALTER TABLE public.game_stakes
            ADD CONSTRAINT uq_game_stakes_session_user UNIQUE (session_id, user_id);
    END IF;
END $$;

-- Thu cược NGUYÊN TỬ: ĐẶT CHỖ (unique gate) TRƯỚC khi trừ ví. Nếu đã tham gia session -> false
-- (không trừ lần 2). Nếu không đủ tiền -> gỡ dòng cược, coi như chưa tham gia.
CREATE OR REPLACE FUNCTION public.stake_collect(p_session uuid, p_game text, p_channel text, p_user text, p_amount bigint)
RETURNS boolean LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE v_upd int; v_ins int;
BEGIN
    IF p_amount <= 0 THEN RETURN false; END IF;
    INSERT INTO users(user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;

    -- Đặt chỗ tham gia session (ràng buộc UNIQUE là "cổng" chống thu cược 2 lần khi bấm nhanh).
    INSERT INTO game_stakes(session_id, game, channel_id, user_id, amount)
        VALUES (p_session, p_game, p_channel, p_user, p_amount)
        ON CONFLICT (session_id, user_id) DO NOTHING;
    GET DIAGNOSTICS v_ins = row_count;
    IF v_ins = 0 THEN RETURN false; END IF;  -- đã tham gia session này

    -- Trừ ví (guard số dư). Không đủ tiền -> gỡ dòng cược vừa đặt.
    UPDATE users SET wallet = wallet - p_amount WHERE user_id = p_user AND wallet >= p_amount;
    GET DIAGNOSTICS v_upd = row_count;
    IF v_upd = 0 THEN
        DELETE FROM game_stakes WHERE session_id = p_session AND user_id = p_user;
        RETURN false;
    END IF;
    RETURN true;
END; $$;

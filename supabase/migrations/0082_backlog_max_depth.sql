-- 0082_backlog_max_depth.sql
-- Triển khai hệ thống BXH Tiệm Bánh, Huy hiệu, Chuyển sinh, Sự kiện thế giới, Cây kỹ năng Pet, và Đền thờ Clan.

-- 1. Thêm các cột bổ trợ cho bảng users và clans
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS prestige INT NOT NULL DEFAULT 0;
ALTER TABLE public.clans ADD COLUMN IF NOT EXISTS resources JSONB NOT NULL DEFAULT '{}';

-- 2. Thêm các cột bổ trợ cho user_pets
ALTER TABLE public.user_pets ADD COLUMN IF NOT EXISTS skills JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.user_pets ADD COLUMN IF NOT EXISTS skill_points INT NOT NULL DEFAULT 0;

-- 3. Tạo bảng user_badges
CREATE TABLE IF NOT EXISTS public.user_badges (
    user_id TEXT NOT NULL,
    badge_id TEXT NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
    slot_index INT CHECK (slot_index BETWEEN 1 AND 6),
    PRIMARY KEY (user_id, badge_id)
);

-- Index tối ưu hóa hiển thị profile
CREATE INDEX IF NOT EXISTS idx_user_badges_equipped ON public.user_badges (user_id) WHERE is_equipped = TRUE;

-- Bật RLS cho user_badges
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on user_badges" ON public.user_badges FOR SELECT USING (true);
CREATE POLICY "Allow service_role full access on user_badges" ON public.user_badges FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Tạo bảng world_events & world_event_contributions
CREATE TABLE IF NOT EXISTS public.world_events (
    id BIGSERIAL PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_amount BIGINT NOT NULL,
    current_amount BIGINT NOT NULL DEFAULT 0,
    ends_at TIMESTAMPTZ NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.world_event_contributions (
    event_id BIGINT REFERENCES public.world_events(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    amount BIGINT NOT NULL DEFAULT 0,
    claimed BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (event_id, user_id)
);

-- Bật RLS cho world_events và contributions
ALTER TABLE public.world_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_event_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on world_events" ON public.world_events FOR SELECT USING (true);
CREATE POLICY "Allow service_role full access on world_events" ON public.world_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read on world_event_contributions" ON public.world_event_contributions FOR SELECT USING (true);
CREATE POLICY "Allow service_role full access on world_event_contributions" ON public.world_event_contributions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Tạo bảng clan_upgrades
CREATE TABLE IF NOT EXISTS public.clan_upgrades (
    clan_id BIGINT PRIMARY KEY REFERENCES public.clans(id) ON DELETE CASCADE,
    shrine_level INT NOT NULL DEFAULT 0,
    wealth_level INT NOT NULL DEFAULT 0,
    war_level INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bật RLS cho clan_upgrades
ALTER TABLE public.clan_upgrades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on clan_upgrades" ON public.clan_upgrades FOR SELECT USING (true);
CREATE POLICY "Allow service_role full access on clan_upgrades" ON public.clan_upgrades FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Trigger tự động đồng bộ hóa likes_count trên bảng bakeries
ALTER TABLE public.bakeries ADD COLUMN IF NOT EXISTS likes_count INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_bakery_likes_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.bakeries SET likes_count = likes_count + 1 WHERE user_id = NEW.bakery_owner_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.bakeries SET likes_count = GREATEST(0, likes_count - 1) WHERE user_id = OLD.bakery_owner_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_sync_bakery_likes
AFTER INSERT OR DELETE ON public.bakery_likes
FOR EACH ROW EXECUTE FUNCTION public.sync_bakery_likes_count();

-- Cập nhật likes_count ban đầu cho các tiệm bánh đang tồn tại
UPDATE public.bakeries b SET likes_count = COALESCE((SELECT COUNT(*) FROM public.bakery_likes l WHERE l.bakery_owner_id = b.user_id), 0);

-- 7. RPC get_bakery_leaderboard (Bảng xếp hạng Tiệm Bánh đa chiều)
CREATE OR REPLACE FUNCTION public.get_bakery_leaderboard(p_limit INT, p_offset INT)
RETURNS TABLE (
    user_id TEXT,
    level INT,
    likes_count INT,
    bakery_score INT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.user_id,
        b.level,
        b.likes_count,
        (b.level * 1000 + b.likes_count * 50 + jsonb_array_length(b.staff) * 100)::INT AS bakery_score
    FROM public.bakeries b
    ORDER BY b.level DESC, b.likes_count DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_bakery_leaderboard(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_bakery_leaderboard(INT, INT) TO service_role;

-- 8. RPC equip_badge (Lắp đặt huy hiệu)
CREATE OR REPLACE FUNCTION public.equip_badge(
    p_user_id TEXT,
    p_badge_id TEXT,
    p_slot INT
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owned BOOLEAN;
BEGIN
    -- 1. Kiểm tra xem người dùng thực sự sở hữu huy hiệu này không
    SELECT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = p_user_id AND badge_id = p_badge_id) INTO v_owned;
    IF NOT v_owned THEN RETURN 'not_owned'; END IF;

    -- 2. Gỡ bỏ huy hiệu cũ ở slot này nếu có
    UPDATE public.user_badges SET is_equipped = FALSE, slot_index = NULL 
    WHERE user_id = p_user_id AND slot_index = p_slot;

    -- 3. Lắp huy hiệu mới vào slot chỉ định
    UPDATE public.user_badges SET is_equipped = TRUE, slot_index = p_slot 
    WHERE user_id = p_user_id AND badge_id = p_badge_id;

    RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.equip_badge(TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equip_badge(TEXT, TEXT, INT) TO service_role;

-- 9. RPC prestige_user (Chuyển sinh)
CREATE OR REPLACE FUNCTION public.prestige_user(
    p_user_id TEXT,
    p_req_exp BIGINT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
    v_exp BIGINT;
    v_prestige INT;
BEGIN
    SELECT exp, prestige INTO v_exp, v_prestige FROM public.users WHERE user_id = p_user_id FOR UPDATE;
    IF v_exp IS NULL THEN 
        RETURN jsonb_build_object('status', 'no_user'); 
    END IF;

    -- Kiểm tra cấp độ tối thiểu
    IF v_exp < p_req_exp THEN
        RETURN jsonb_build_object('status', 'level_insufficient');
    END IF;

    -- Tiến hành chuyển sinh
    UPDATE public.users SET 
        exp = 0,
        prestige = prestige + 1,
        wallet = 5000, -- Cung cấp 5,000 xu khởi nghiệp
        bank = 0,
        job_id = NULL -- Hủy nghề nghiệp hiện tại để bắt đầu lại
    WHERE user_id = p_user_id;

    -- Tự động hồi phục đầy năng lượng cho người chơi khởi nghiệp
    UPDATE public.energy SET amount = 100 WHERE user_id = p_user_id;

    -- Thưởng nóng Huy hiệu Chuyển sinh tương ứng
    INSERT INTO public.user_badges (user_id, badge_id, is_equipped, slot_index)
    VALUES (p_user_id, 'prestige_' || (v_prestige + 1), TRUE, 1)
    ON CONFLICT (user_id, badge_id) DO UPDATE SET is_equipped = TRUE, slot_index = 1;

    RETURN jsonb_build_object('status', 'ok', 'new_prestige', v_prestige + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.prestige_user(TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prestige_user(TEXT, BIGINT) TO service_role;

-- 10. RPC contribute_world_event (Đóng đóng góp co-op sự kiện thế giới)
CREATE OR REPLACE FUNCTION public.contribute_world_event(
    p_user_id TEXT,
    p_event_id BIGINT,
    p_amount BIGINT
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
    v_item TEXT; v_qty INT; v_ended BOOLEAN;
BEGIN
    -- 1. Kiểm tra trạng thái sự kiện
    SELECT target_type, (ends_at < now() OR completed) INTO v_item, v_ended FROM public.world_events WHERE id = p_event_id FOR UPDATE;
    IF v_ended THEN RETURN 'event_ended'; END IF;

    -- 2. Khấu trừ tài nguyên của người chơi
    IF v_item = 'coins' THEN
        DECLARE v_wallet BIGINT;
        BEGIN
            SELECT wallet INTO v_wallet FROM public.users WHERE user_id = p_user_id FOR UPDATE;
            IF v_wallet < p_amount THEN RETURN 'insufficient'; END IF;
            UPDATE public.users SET wallet = wallet - p_amount WHERE user_id = p_user_id;
        END;
    ELSE
        SELECT quantity INTO v_qty FROM public.inventory WHERE user_id = p_user_id AND item_id = v_item FOR UPDATE;
        IF v_qty IS NULL OR v_qty < p_amount THEN RETURN 'insufficient'; END IF;
        UPDATE public.inventory SET quantity = quantity - p_amount WHERE user_id = p_user_id AND item_id = v_item;
        DELETE FROM public.inventory WHERE user_id = p_user_id AND item_id = v_item AND quantity <= 0;
    END IF;

    -- 3. Cập nhật tiến trình sự kiện
    UPDATE public.world_events SET current_amount = current_amount + p_amount WHERE id = p_event_id;
    
    -- Ghi nhận đóng góp cá nhân
    INSERT INTO public.world_event_contributions (event_id, user_id, amount)
    VALUES (p_event_id, p_user_id, p_amount)
    ON CONFLICT (event_id, user_id) 
    DO UPDATE SET amount = public.world_event_contributions.amount + p_amount;

    -- Tự động đánh dấu hoàn thành nếu mốc đạt 100%
    UPDATE public.world_events SET completed = TRUE WHERE id = p_event_id AND current_amount >= target_amount;

    RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.contribute_world_event(TEXT, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contribute_world_event(TEXT, BIGINT, BIGINT) TO service_role;

-- 11. RPC upgrade_clan_shrine (Nâng cấp đền thờ clan)
CREATE OR REPLACE FUNCTION public.upgrade_clan_shrine(
    p_clan_id BIGINT,
    p_req_gold BIGINT,
    p_req_wood INT,
    p_req_iron INT
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
    v_resources JSONB; v_wood INT; v_iron INT; v_gold BIGINT;
BEGIN
    -- 1. Kiểm tra và khóa tài nguyên kho bang hội
    SELECT bank, resources INTO v_gold, v_resources FROM public.clans WHERE id = p_clan_id FOR UPDATE;
    IF v_gold IS NULL THEN RETURN 'no_clan'; END IF;
    
    v_wood := COALESCE((v_resources ->> 'tam_go')::INT, 0);
    v_iron := COALESCE((v_resources ->> 'thoi_sat')::INT, 0);

    IF v_gold < p_req_gold OR v_wood < p_req_wood OR v_iron < p_req_iron THEN
        RETURN 'insufficient_resources';
    END IF;

    -- 2. Trừ tài nguyên bang hội
    UPDATE public.clans SET 
        bank = bank - p_req_gold,
        resources = jsonb_build_object(
            'tam_go', GREATEST(0, v_wood - p_req_wood),
            'thoi_sat', GREATEST(0, v_iron - p_req_iron)
        )
    WHERE id = p_clan_id;

    -- 3. Tăng cấp độ đền thờ
    INSERT INTO public.clan_upgrades (clan_id, shrine_level)
    VALUES (p_clan_id, 1)
    ON CONFLICT (clan_id) 
    DO UPDATE SET shrine_level = public.clan_upgrades.shrine_level + 1, updated_at = now();

    RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.upgrade_clan_shrine(BIGINT, BIGINT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_clan_shrine(BIGINT, BIGINT, INT, INT) TO service_role;

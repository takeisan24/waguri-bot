-- 0081_user_badges_and_likes.sql
-- Triển khai hệ thống Huy hiệu, lượt thích tiệm bánh và Đá đông cứng chuỗi (Streak Freeze).

-- 1. Thêm cột badges vào bảng users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS badges JSONB NOT NULL DEFAULT '[]';

-- 2. Tạo bảng bakery_likes
CREATE TABLE IF NOT EXISTS public.bakery_likes (
    liker_id TEXT NOT NULL,
    bakery_owner_id TEXT NOT NULL,
    liked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (liker_id, bakery_owner_id)
);

-- Bật RLS cho bakery_likes
ALTER TABLE public.bakery_likes ENABLE ROW LEVEL SECURITY;

-- Tạo policy truy cập
CREATE POLICY "Allow public read on bakery_likes" ON public.bakery_likes FOR SELECT USING (true);
CREATE POLICY "Allow service_role full access on bakery_likes" ON public.bakery_likes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Thêm Đá Đông Cứng Chuỗi vào danh sách items
INSERT INTO public.items (id, name, type, category, price, description, rarity) VALUES
('streak_freeze', 'Đá Đông Cứng Chuỗi', 'consumable', 'misc', 15000, 'Viên tinh thể ma thuật bảo vệ chuỗi điểm danh của bạn không bị reset khi quên điểm danh /daily trễ.', 'rare')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, description = EXCLUDED.description, rarity = EXCLUDED.rarity;

-- 4. RPC like_bakery để thả tim tiệm bánh
CREATE OR REPLACE FUNCTION public.like_bakery(
    p_liker_id TEXT,
    p_bakery_owner_id TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_likes_today INT;
    v_has_bakery BOOLEAN;
BEGIN
    -- 1. Kiểm tra tiệm bánh của chủ tiệm có tồn tại không
    SELECT EXISTS (
        SELECT 1 FROM public.bakeries WHERE user_id = p_bakery_owner_id
    ) INTO v_has_bakery;

    IF NOT v_has_bakery THEN
        RETURN 'no_bakery';
    END IF;

    -- 2. Đếm số lượt thả tim trong ngày của người dùng
    SELECT COUNT(*)::INT INTO v_likes_today
    FROM public.bakery_likes
    WHERE liker_id = p_liker_id AND liked_at::date = now()::date;

    IF v_likes_today >= 3 THEN
        RETURN 'limit_reached';
    END IF;

    -- 3. Kiểm tra xem hôm nay đã thích tiệm bánh này chưa
    IF EXISTS (
        SELECT 1 FROM public.bakery_likes
        WHERE liker_id = p_liker_id AND bakery_owner_id = p_bakery_owner_id AND liked_at::date = now()::date
    ) THEN
        RETURN 'already_liked_today';
    END IF;

    -- 4. Ghi nhận lượt thích
    INSERT INTO public.bakery_likes (liker_id, bakery_owner_id, liked_at)
    VALUES (p_liker_id, p_bakery_owner_id, now());

    RETURN 'ok';
END;
$$;

-- Phân quyền RPC like_bakery
REVOKE ALL ON FUNCTION public.like_bakery(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.like_bakery(TEXT, TEXT) TO service_role;

-- 5. Cập nhật RPC claim_daily hỗ trợ Đá Đông Cứng Chuỗi (Lazy check & consume)
CREATE OR REPLACE FUNCTION public.claim_daily(p_user_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_last timestamptz; v_streak int; v_reward bigint; v_wallet bigint; v_bank bigint;
    v_interest bigint; v_milestone bigint := 0; v_assets bigint; v_tax bigint;
    v_clan bigint; v_cxp bigint; v_cbank bigint; v_clevel int; v_dividend bigint := 0;
    v_has_freeze boolean := false;
    v_freeze_used boolean := false;
    c_threshold constant bigint := 100000;
    c_rate constant numeric := 0.01;
    c_cap constant bigint := 50000;
BEGIN
    INSERT INTO users(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING;
    SELECT last_daily, daily_streak, wallet, bank, clan_id INTO v_last, v_streak, v_wallet, v_bank, v_clan FROM users WHERE user_id=p_user_id;
    IF v_wallet IS NULL THEN v_wallet := 0; END IF;
    IF v_bank   IS NULL THEN v_bank   := 0; END IF;

    IF v_last IS NOT NULL AND now() < v_last + interval '24 hours' THEN
        RETURN jsonb_build_object('status','claimed','next', v_last + interval '24 hours');
    END IF;

    IF v_last IS NOT NULL AND now() < v_last + interval '48 hours' THEN
        v_streak := coalesce(v_streak,0) + 1;
    ELSE
        -- Kiểm tra xem user có Đá Đông Cứng Chuỗi trong kho đồ (inventory) không
        SELECT EXISTS (
            SELECT 1 FROM public.inventory 
            WHERE user_id = p_user_id AND item_id = 'streak_freeze' AND quantity > 0
        ) INTO v_has_freeze;

        IF v_has_freeze THEN
            -- Khấu trừ 1 đá đông cứng chuỗi
            UPDATE public.inventory 
            SET quantity = quantity - 1 
            WHERE user_id = p_user_id AND item_id = 'streak_freeze';

            -- Dọn dẹp dòng nếu số lượng giảm về 0
            DELETE FROM public.inventory 
            WHERE user_id = p_user_id AND item_id = 'streak_freeze' AND quantity <= 0;

            -- Giữ nguyên streak hiện tại và tăng thêm 1
            v_streak := coalesce(v_streak,0) + 1;
            v_freeze_used := true;
        ELSE
            -- Hết đá đông cứng chuỗi hoặc không có -> Reset streak về 1
            v_streak := 1;
        END IF;
    END IF;

    v_reward := 1000 + least(v_streak - 1, 29) * 200;
    IF v_streak = 7 THEN v_milestone := 2000;
    ELSIF v_streak = 14 THEN v_milestone := 5000;
    ELSIF v_streak = 30 THEN v_milestone := 20000;
    END IF;
    v_reward := v_reward + v_milestone;

    v_interest := least(floor(v_bank * 0.002), 5000);

    -- Cổ tức bang hội theo cấp — TRỪ TỪ QUỸ BANG (redistribute), KHÔNG mint.
    IF v_clan IS NOT NULL THEN
        SELECT xp, bank INTO v_cxp, v_cbank FROM public.clans WHERE id = v_clan FOR UPDATE;
        v_clevel := floor(sqrt(coalesce(v_cxp,0) / 10000.0)) + 1;
        v_dividend := least(v_clevel * 100, greatest(coalesce(v_cbank,0), 0));
        IF v_dividend > 0 THEN
            UPDATE public.clans SET bank = bank - v_dividend WHERE id = v_clan;
            v_reward := v_reward + v_dividend;
        END IF;
    END IF;

    v_assets := v_wallet + v_bank;
    v_tax := least(floor(greatest(0, v_assets - c_threshold) * c_rate), c_cap);

    v_wallet := v_wallet + v_reward;
    v_bank   := v_bank + v_interest;

    IF v_tax <= v_bank THEN
        v_bank := v_bank - v_tax;
    ELSE
        v_wallet := v_wallet - (v_tax - v_bank);
        v_bank := 0;
    END IF;

    UPDATE public.users SET wallet = v_wallet, bank = v_bank, last_daily = now(), daily_streak = v_streak
        WHERE user_id=p_user_id;

    RETURN jsonb_build_object('status','ok','reward', v_reward, 'streak', v_streak,
        'interest', v_interest, 'milestone', v_milestone, 'tax', v_tax, 'clan_dividend', v_dividend,
        'streak_freeze_used', v_freeze_used);
END;
$$;

-- Phân quyền RPC claim_daily
REVOKE ALL ON FUNCTION public.claim_daily(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily(TEXT) TO service_role;

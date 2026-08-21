-- ============================================================
-- 0130_clan_dividend_tenure.sql — Chặn hút quỹ ở ĐÚNG CHỖ ĐAU, mở lại cửa bang.
--
-- 0129 chặn ở CỬA VÀO: bắt mọi bang phải mời mới vào được. Chặn được vòng
--     /clan join <bang giàu> -> /daily -> /clan leave
-- nhưng phải đóng cả những bang muốn mở cửa tuyển người, và người mới không quen
-- ai thì đứng ngoài. Sai chỗ: vấn đề không phải "người lạ VÀO bang", mà là
-- "người vừa vào đã ĂN ĐƯỢC cổ tức ngay hôm đó rồi rời đi".
--
-- 0130 dời cổng từ cửa vào sang cổ tức:
--   · `clan_join` MỞ LẠI — ai cũng tự vào được như trước 0129.
--   · Thêm `users.clan_dividend_at` = mốc thời gian bắt đầu được ăn cổ tức.
--     Tự vào  -> now() + 7 ngày (phải thật sự là thành viên mới có phần).
--     Được trưởng bang mời -> now() (trưởng bang bảo lãnh thì ăn ngay).
--   · `claim_daily` chỉ chia cổ tức khi đã tới mốc.
--
-- Vì sao mời = ăn ngay mà KHÔNG mở lại lỗ: cổ tức trừ thẳng từ quỹ bang, và chỉ
-- TRƯỞNG BANG mới mời được. Trưởng bang mời người vào ăn quỹ của chính mình thì
-- không lời được gì — họ vốn đã `/clan withdraw` sạch quỹ được rồi. Lỗ cũ là người
-- LẠ tự vào ăn quỹ NGƯỜI KHÁC; đường đó nay đóng bằng mốc 7 ngày.
--
-- 7 ngày, không phải 24h: 24h chỉ làm kẻ hút quỹ chậm lại một ngày. 7 ngày là
-- khoảng đủ để trưởng bang nhìn thấy người lạ trong `/clan info` và `/clan kick`
-- trước khi mất đồng nào. Cũng trùng hạn của lời mời ở 0129 cho dễ nhớ.
--
-- NULL = được ăn ngay. Thành viên có từ trước 0130 (hiện 0 bang, nên không có ai)
-- không bị phạt ngược.
-- ============================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS clan_dividend_at timestamptz;

-- ------------------------------------------------------------
-- clan_join — MỞ LẠI. Lời mời không còn là điều kiện vào, chỉ còn là bảo lãnh.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clan_join(p_user text, p_name text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_clan bigint; v_id bigint; v_cname text; v_del int; v_from timestamptz;
begin
    insert into users(user_id) values(p_user) on conflict(user_id) do nothing;
    select clan_id into v_clan from users where user_id = p_user for update;
    if v_clan is not null then return jsonb_build_object('status','in_clan'); end if;
    select id, name into v_id, v_cname from clans where lower(name) = lower(p_name);
    if v_id is null then return jsonb_build_object('status','notfound'); end if;

    -- Xoá-và-đếm trong MỘT câu: "select rồi delete" thì hai lời gọi song song cùng đọc
    -- thấy lời mời rồi cùng được bảo lãnh. Ở đây chỉ đúng một lời gọi nhận ROW_COUNT = 1.
    delete from clan_invites
     where clan_id = v_id and user_id = p_user and expires_at > now();
    get diagnostics v_del = row_count;

    -- Có mời -> ăn cổ tức ngay. Tự vào -> chờ 7 ngày.
    v_from := case when v_del > 0 then now() else now() + interval '7 days' end;

    update users set clan_id = v_id, clan_dividend_at = v_from where user_id = p_user;
    -- Vào được một bang rồi thì lời mời của các bang KHÁC thành rác.
    delete from clan_invites where user_id = p_user;
    return jsonb_build_object('status','ok','id', v_id, 'name', v_cname,
                              'vouched', v_del > 0, 'dividend_at', v_from);
end; $function$;

-- ------------------------------------------------------------
-- clan_create — trưởng bang ăn cổ tức ngay, không phải chờ bang của chính mình.
-- Giữ nguyên phần còn lại của 0030.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clan_create(p_user text, p_name text, p_cost bigint)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_clan bigint; v_id bigint; v_upd int;
begin
    insert into users(user_id) values(p_user) on conflict(user_id) do nothing;
    select clan_id into v_clan from users where user_id = p_user for update;
    if v_clan is not null then return jsonb_build_object('status','in_clan'); end if;
    if exists (select 1 from clans where lower(name) = lower(p_name)) then return jsonb_build_object('status','name_taken'); end if;
    update users set wallet = wallet - p_cost where user_id = p_user and wallet >= p_cost;
    get diagnostics v_upd = row_count;
    if v_upd = 0 then return jsonb_build_object('status','poor'); end if;
    insert into clans(name, leader_id) values (p_name, p_user) returning id into v_id;
    update users set clan_id = v_id, clan_dividend_at = now() where user_id = p_user;
    return jsonb_build_object('status','ok','id', v_id);
end; $function$;

-- ------------------------------------------------------------
-- Rời bang / bị đuổi / bang giải tán -> xoá mốc, lần sau vào lại phải chờ lại.
-- Không xoá thì mốc cũ (đã qua) còn nằm đó, người rời rồi vào lại được ăn ngay
-- -> đúng vòng lặp mà 0130 đang chặn.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clan_leave(p_user text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_clan bigint; v_leader text;
begin
    select clan_id into v_clan from users where user_id = p_user for update;
    if v_clan is null then return jsonb_build_object('status','not_in'); end if;
    select leader_id into v_leader from clans where id = v_clan;
    if v_leader = p_user then return jsonb_build_object('status','is_leader'); end if;
    update users set clan_id = null, clan_dividend_at = null where user_id = p_user;
    return jsonb_build_object('status','ok');
end; $function$;

CREATE OR REPLACE FUNCTION public.clan_kick(p_leader text, p_target text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_clan bigint; v_leader text; v_tclan bigint;
begin
    select clan_id into v_clan from users where user_id = p_leader for update;
    if v_clan is null then return jsonb_build_object('status','not_in'); end if;
    select leader_id into v_leader from clans where id = v_clan;
    if v_leader is null then return jsonb_build_object('status','not_in'); end if;
    if v_leader <> p_leader then return jsonb_build_object('status','not_leader'); end if;
    if p_target = p_leader then return jsonb_build_object('status','self'); end if;
    -- for update trên hàng NGƯỜI BỊ ĐUỔI: bản 0030 đọc không khoá rồi ghi đè. Người đó
    -- gõ /clan leave đúng lúc thì lệnh kick vẫn ghi clan_id = null lên một hàng đã đổi.
    select clan_id into v_tclan from users where user_id = p_target for update;
    if v_tclan is distinct from v_clan then return jsonb_build_object('status','not_member'); end if;
    update users set clan_id = null, clan_dividend_at = null where user_id = p_target;
    -- Đuổi rồi thì lời mời cũ của bang này (nếu có) không được sống lại.
    delete from clan_invites where clan_id = v_clan and user_id = p_target;
    return jsonb_build_object('status','ok');
end; $function$;

CREATE OR REPLACE FUNCTION public.clan_disband(p_user text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_clan bigint; v_leader text; v_bank bigint;
begin
    select clan_id into v_clan from users where user_id = p_user for update;
    if v_clan is null then return jsonb_build_object('status','not_in'); end if;
    select leader_id, bank into v_leader, v_bank from clans where id = v_clan for update;
    -- Lời gọi disband THỨ HAI đọc được hàng đã xoá -> v_leader NULL. Không chặn ở đây
    -- thì `NULL <> p_user` cho NULL (không phải TRUE), hàm rơi thẳng xuống 'ok' và
    -- báo giải tán thành công lần thứ hai.
    if v_leader is null then return jsonb_build_object('status','not_in'); end if;
    if v_leader <> p_user then return jsonb_build_object('status','not_leader'); end if;
    update users set clan_id = null, clan_dividend_at = null where clan_id = v_clan;
    if v_bank > 0 then update users set wallet = wallet + v_bank where user_id = p_user; end if;
    delete from clans where id = v_clan;   -- clan_invites cascade theo
    return jsonb_build_object('status','ok','refund', v_bank);
end; $function$;

-- ------------------------------------------------------------
-- claim_daily — giữ NGUYÊN bản 0081 (đá đông cứng chuỗi, thuế tài sản, lãi ngân
-- hàng, cổ tức TRỪ TỪ QUỸ BANG chứ không mint), chỉ thêm điều kiện thâm niên.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_daily(p_user_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_last timestamptz; v_streak int; v_reward bigint; v_wallet bigint; v_bank bigint;
    v_interest bigint; v_milestone bigint := 0; v_assets bigint; v_tax bigint;
    v_clan bigint; v_cxp bigint; v_cbank bigint; v_clevel int; v_dividend bigint := 0;
    v_div_at timestamptz; v_div_wait boolean := false;
    v_freeze_rows int := 0;
    v_freeze_used boolean := false;
    c_threshold constant bigint := 100000;
    c_rate constant numeric := 0.01;
    c_cap constant bigint := 50000;
BEGIN
    INSERT INTO users(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING;
    -- FOR UPDATE: bản 0081 đọc không khoá rồi ghi lại. Hai lời gọi /daily song song
    -- (bấm nhanh hai lần, hoặc hai shard) cùng đọc last_daily cũ, cùng qua được cổng
    -- 24h, cùng cộng thưởng -> NHÂN ĐÔI tiền điểm danh. Khoá hàng người dùng ở đây thì
    -- lời gọi thứ hai phải xếp hàng, đọc được last_daily mới và trả 'claimed'.
    SELECT last_daily, daily_streak, wallet, bank, clan_id, clan_dividend_at
      INTO v_last, v_streak, v_wallet, v_bank, v_clan, v_div_at
      FROM users WHERE user_id=p_user_id FOR UPDATE;
    IF v_wallet IS NULL THEN v_wallet := 0; END IF;
    IF v_bank   IS NULL THEN v_bank   := 0; END IF;

    IF v_last IS NOT NULL AND now() < v_last + interval '24 hours' THEN
        RETURN jsonb_build_object('status','claimed','next', v_last + interval '24 hours');
    END IF;

    IF v_last IS NOT NULL AND now() < v_last + interval '48 hours' THEN
        v_streak := coalesce(v_streak,0) + 1;
    ELSE
        -- Đá Đông Cứng Chuỗi: TIÊU TRƯỚC, HỎI SAU. Bản 0081 làm SELECT EXISTS rồi mới
        -- UPDATE — đọc-rồi-ghi không khoá, hai lời gọi song song cùng thấy "có đá" rồi
        -- cùng trừ, mất 2 viên mà chỉ giữ 1 chuỗi. Một câu UPDATE có guard quantity > 0
        -- rồi soi ROW_COUNT thì việc trừ và việc kiểm là CÙNG một thao tác nguyên tử.
        UPDATE public.inventory
           SET quantity = quantity - 1
         WHERE user_id = p_user_id AND item_id = 'streak_freeze' AND quantity > 0;
        GET DIAGNOSTICS v_freeze_rows = ROW_COUNT;

        IF v_freeze_rows > 0 THEN
            DELETE FROM public.inventory
             WHERE user_id = p_user_id AND item_id = 'streak_freeze' AND quantity <= 0;

            v_streak := coalesce(v_streak,0) + 1;
            v_freeze_used := true;
        ELSE
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
    -- NAY thêm cổng thâm niên: chưa tới clan_dividend_at thì không có phần. Chính
    -- cổng này giết vòng join -> daily -> leave, chứ không phải việc khoá cửa bang.
    -- NULL = thành viên có trước 0130 -> cho ăn ngay, không phạt ngược.
    IF v_clan IS NOT NULL THEN
        IF v_div_at IS NOT NULL AND now() < v_div_at THEN
            v_div_wait := true;
        ELSE
            SELECT xp, bank INTO v_cxp, v_cbank FROM public.clans WHERE id = v_clan FOR UPDATE;
            v_clevel := floor(sqrt(coalesce(v_cxp,0) / 10000.0)) + 1;
            v_dividend := least(v_clevel * 100, greatest(coalesce(v_cbank,0), 0));
            IF v_dividend > 0 THEN
                UPDATE public.clans SET bank = bank - v_dividend WHERE id = v_clan;
                v_reward := v_reward + v_dividend;
            END IF;
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
        'streak_freeze_used', v_freeze_used,
        -- để /daily nói được "còn N ngày nữa mới có cổ tức" thay vì im lặng bỏ qua
        'clan_dividend_wait', v_div_wait, 'clan_dividend_at', v_div_at);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily(TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.clan_join(text, text)   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clan_join(text, text)   TO service_role;
REVOKE ALL ON FUNCTION public.clan_create(text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clan_create(text, text, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.clan_leave(text)   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clan_leave(text)   TO service_role;
REVOKE ALL ON FUNCTION public.clan_kick(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clan_kick(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.clan_disband(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clan_disband(text) TO service_role;

-- ============================================================
-- 0129_clan_invite.sql — Bang hội chuyển sang MỜI MỚI VÀO ĐƯỢC.
--
-- LỖI: `clan_join` (0030) chỉ cần đúng tên bang là vào. Không mời, không duyệt,
-- không giới hạn. Ghép với cổ tức `cấp * 100`/người/ngày RÚT TỪ QUỸ BANG
-- (claim_daily, 0081) thì bất kỳ ai cũng gõ được:
--     /clan join <tên bang giàu>  ->  /daily  ->  /clan leave
-- và ăn quỹ của người khác mà chưa từng góp một xu. Bang càng cấp cao càng bị hút
-- nhanh, vì cổ tức tỉ lệ thuận với cấp. Trưởng bang không có bất kỳ công cụ nào
-- chặn trước — `clan_kick` chỉ đuổi được SAU KHI người đó đã ăn xong.
--
-- CÁCH SỬA: thêm bảng lời mời + đổi `clan_join` thành "phải có lời mời còn hạn".
-- Không thêm lệnh `accept` riêng: người được mời vẫn gõ đúng `/clan join <tên>` như
-- cũ, chỉ khác là nay phải có lời mời. Bề mặt lệnh chỉ +1 subcommand (`invite`).
--
-- Lời mời HẾT HẠN sau 7 ngày. Có hạn thì trưởng bang không cần lệnh thu hồi
-- (mời nhầm thì chờ hết hạn, hoặc kick sau khi họ vào) — đỡ một subcommand nữa.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.clan_invites (
    clan_id    bigint      NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
    user_id    text        NOT NULL,
    invited_by text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
    PRIMARY KEY (clan_id, user_id)
);

-- ON DELETE CASCADE ở trên lo việc giải tán bang: `clan_disband` xoá hàng clans,
-- lời mời treo của bang đó biến mất theo. Không cần sửa clan_disband.

-- Tra "người này đang được bang nào mời" khi họ gõ /clan join.
CREATE INDEX IF NOT EXISTS idx_clan_invites_user
    ON public.clan_invites (user_id, expires_at DESC);

ALTER TABLE public.clan_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clan_invites FROM anon, authenticated;
GRANT ALL ON TABLE public.clan_invites TO service_role;

-- ------------------------------------------------------------
-- Mời người vào bang (chỉ trưởng bang).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clan_invite(p_leader text, p_target text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_clan bigint; v_leader text; v_cname text; v_tclan bigint;
begin
    if p_target = p_leader then return jsonb_build_object('status','self'); end if;

    -- Thứ tự khoá THỐNG NHẤT users -> clans, giống clan_withdraw/clan_disband.
    select clan_id into v_clan from users where user_id = p_leader for update;
    if v_clan is null then return jsonb_build_object('status','not_in'); end if;
    select leader_id, name into v_leader, v_cname from clans where id = v_clan for update;
    -- Bang có thể vừa bị disband ở lời gọi song song -> v_leader NULL. `NULL <> p_leader`
    -- cho NULL chứ không phải TRUE, không chặn ở đây thì hàm rơi xuống 'ok' -> mời vào
    -- một bang không còn tồn tại.
    if v_leader is null then return jsonb_build_object('status','not_in'); end if;
    if v_leader <> p_leader then return jsonb_build_object('status','not_leader'); end if;

    -- Người được mời đã ở bang nào đó rồi thì mời cũng vô nghĩa: clan_join sẽ chặn
    -- bằng 'in_clan'. Báo ngay để trưởng bang biết, thay vì để lời mời chết nằm đó.
    insert into users(user_id) values(p_target) on conflict(user_id) do nothing;
    select clan_id into v_tclan from users where user_id = p_target;
    if v_tclan is not null then
        return jsonb_build_object('status', case when v_tclan = v_clan then 'already_member' else 'in_other_clan' end);
    end if;

    -- Mời lại người đã mời = gia hạn, không phải lỗi. Trưởng bang hay mời lại khi
    -- người kia chưa kịp gõ /clan join.
    insert into clan_invites(clan_id, user_id, invited_by)
    values (v_clan, p_target, p_leader)
    on conflict (clan_id, user_id) do update
        set invited_by = excluded.invited_by,
            created_at = now(),
            expires_at = now() + interval '7 days';

    return jsonb_build_object('status','ok','clan', v_cname);
end; $function$;

-- ------------------------------------------------------------
-- Gia nhập bang — NAY PHẢI CÓ LỜI MỜI CÒN HẠN.
-- Giữ nguyên chữ ký và mọi status cũ của 0030; chỉ thêm cổng 'no_invite'.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clan_join(p_user text, p_name text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_clan bigint; v_id bigint; v_cname text; v_del int;
begin
    insert into users(user_id) values(p_user) on conflict(user_id) do nothing;
    select clan_id into v_clan from users where user_id = p_user for update;
    if v_clan is not null then return jsonb_build_object('status','in_clan'); end if;
    select id, name into v_id, v_cname from clans where lower(name) = lower(p_name);
    if v_id is null then return jsonb_build_object('status','notfound'); end if;

    -- Cổng mời: xoá-và-đếm trong MỘT câu lệnh. Làm cách "select rồi delete" thì hai
    -- lời gọi song song cùng đọc thấy lời mời rồi cùng đi tiếp; ở đây chỉ đúng một
    -- lời gọi nhận được ROW_COUNT = 1. Lời mời là dùng-một-lần.
    delete from clan_invites
     where clan_id = v_id and user_id = p_user and expires_at > now();
    get diagnostics v_del = row_count;
    if v_del = 0 then return jsonb_build_object('status','no_invite','name', v_cname); end if;

    update users set clan_id = v_id where user_id = p_user;
    -- Vào được một bang rồi thì lời mời của các bang KHÁC thành rác. Dọn luôn để
    -- không có lời mời treo trỏ tới người đã có bang.
    delete from clan_invites where user_id = p_user;
    return jsonb_build_object('status','ok','id', v_id, 'name', v_cname);
end; $function$;

REVOKE ALL ON FUNCTION public.clan_invite(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clan_invite(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.clan_join(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clan_join(text, text) TO service_role;

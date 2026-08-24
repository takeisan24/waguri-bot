-- ============================================================
-- 0144_thuong_su_kien_va_huy_hieu_gop_giao_dich.sql
--
-- SỐ HIỆU: ban đầu đánh 0143, đổi sang 0144 vì worktree `study-lofi-and-db` đã áp
-- `web_study_session` lên prod lúc 11:55:18, trước bản này 3 phút 43 giây (tra sổ migration
-- của prod, không đoán). Cổng `R1_duplicate_number_worktree` — viết sáng cùng ngày — bắt
-- được va chạm này ngay ở bước push, đúng thứ nó sinh ra để chặn.
-- Gộp hai luồng "ghi nhận rồi mới trao" vào MỘT giao dịch.
--
-- Cùng hình dạng với lỗi `/achievements` đã vá ở 0141: bước ghi nhận thành công, bước trao
-- thưởng hỏng, và vì bước ghi nhận không đảo lại được nên chạy lại cũng KHÔNG trao lại.
--
-- (1) `/worldevent claim` — NẶNG NHẤT, mất vĩnh viễn
--     JS đang làm: `claimWorldEventReward()` đặt `claimed = true` (so-sánh-rồi-đặt, đúng),
--     RỒI mới `giveItemAdmin(...)` — và BỎ giá trị trả về. Bước hai hỏng thì cờ `claimed`
--     đã bật, lần sau trả `already_claimed`, người chơi mất phần thưởng không đường đòi.
--     Màn hình thì vẫn khoe "Cậu nhận được Nx <vật phẩm>".
--
-- (2) `/cosmetic badge-buy` — mất một lần, làm lại được
--     JS đang làm BA lời gọi rời nhau: trừ tiền -> cấp huy hiệu -> nếu trùng thì hoàn tiền,
--     mà lời hoàn tiền KHÔNG kiểm kết quả. Chết giữa bước 1 và 2, hoặc hoàn tiền hỏng, là
--     mất tiền im lặng. Hàm dưới đây bỏ hẳn đường hoàn tiền: kiểm sở hữu TRƯỚC khi trừ, nên
--     không bao giờ phải trả lại thứ chưa lấy.
--
-- Đo trên prod 2026-08-24 (lý do vẫn vá dù số nhỏ): 1 sự kiện thế giới tồn tại nhưng 0 lượt
-- đóng góp; 0 huy hiệu từng được mua. Cả hai là lỗi TIỀM ẨN — vá trước khi tính năng được
-- đẩy mạnh, vì sự kiện thế giới là thứ cả server cùng bấm nhận thưởng một lúc.
-- ============================================================

-- ── 1. Nhận thưởng sự kiện thế giới ─────────────────────────────────────────────────
-- Trả: not_completed · no_contribution · already_claimed · ok
-- Đặt cờ `claimed` và cấp vật phẩm trong CÙNG một giao dịch: cấp hỏng thì cờ cuộn lại,
-- người chơi bấm lại là nhận được.
create or replace function public.claim_world_event_reward_atomic(
    p_user text, p_event bigint, p_item text, p_qty int)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare v_done boolean; v_claimed boolean; v_upd int;
begin
    if p_qty is null or p_qty < 0 then
        raise exception 'claim_world_event_reward_atomic: số lượng âm (%)', p_qty;
    end if;

    select completed into v_done from world_events where id = p_event;
    if v_done is null then return 'not_completed'; end if;
    if not v_done then return 'not_completed'; end if;

    -- Khoá dòng đóng góp để hai lần bấm đồng thời không cùng đi qua.
    select claimed into v_claimed from world_event_contributions
     where event_id = p_event and user_id = p_user
     for update;
    if not found then return 'no_contribution'; end if;
    if coalesce(v_claimed, false) then return 'already_claimed'; end if;

    update world_event_contributions set claimed = true
     where event_id = p_event and user_id = p_user and coalesce(claimed, false) = false;
    get diagnostics v_upd = row_count;
    if v_upd = 0 then return 'already_claimed'; end if;

    -- Cấp vật phẩm TRONG cùng giao dịch. Hỏng ở đây -> cả `claimed` ở trên cuộn lại.
    if p_item is not null and p_qty > 0 then
        insert into inventory (user_id, item_id, quantity)
        values (p_user, p_item, p_qty)
        on conflict (user_id, item_id) do update
            set quantity = inventory.quantity + excluded.quantity;
    end if;

    return 'ok';
end; $function$;

-- ── 2. Mua huy hiệu ─────────────────────────────────────────────────────────────────
-- Trả: owned · poor · ok
-- Kiểm sở hữu TRƯỚC khi trừ tiền, nên không có đường hoàn tiền để mà hỏng.
create or replace function public.buy_badge(p_user text, p_badge text, p_cost bigint)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare v_upd int;
begin
    if p_cost is null or p_cost < 0 then
        raise exception 'buy_badge: giá âm (%)', p_cost;
    end if;

    insert into users(user_id) values (p_user) on conflict (user_id) do nothing;
    -- Khoá ví trước: chốt thứ tự khoá giống mọi RPC tiền khác, tránh deadlock chéo.
    perform 1 from users where user_id = p_user for update;

    if exists (select 1 from user_badges where user_id = p_user and badge_id = p_badge) then
        return 'owned';
    end if;

    update users set wallet = wallet - p_cost
     where user_id = p_user and wallet >= p_cost;
    get diagnostics v_upd = row_count;
    if v_upd = 0 then return 'poor'; end if;

    -- `do nothing` + row_count: hai lần bấm đồng thời thì lần thua không chèn được, và vì
    -- nằm cùng giao dịch nên tiền vừa trừ cũng cuộn lại — không cần hoàn tay.
    insert into user_badges (user_id, badge_id)
    values (p_user, p_badge)
    on conflict (user_id, badge_id) do nothing;
    get diagnostics v_upd = row_count;
    if v_upd = 0 then
        raise exception 'buy_badge: đua cấp huy hiệu % cho %, cuộn lại giao dịch', p_badge, p_user;
    end if;

    return 'ok';
end; $function$;

revoke all on function public.claim_world_event_reward_atomic(text, bigint, text, int) from public, anon, authenticated;
revoke all on function public.buy_badge(text, text, bigint)                             from public, anon, authenticated;
grant execute on function public.claim_world_event_reward_atomic(text, bigint, text, int) to service_role;
grant execute on function public.buy_badge(text, text, bigint)                            to service_role;

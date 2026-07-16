-- ============================================================
-- 0087_audit_atomicity_fixes.sql — Vá lỗi race-condition từ audit 2026-07
--   H9  sell_item        : thêm FOR UPDATE + guard row_count (chống bán đúp = dupe tiền)
--   H10 quest_claim      : thêm FOR UPDATE (chống nhận thưởng nhiệm vụ 2 lần)
--   M7  consume_ai_quota : thêm FOR UPDATE (chống vượt cap AI khi gọi đồng thời)
--   M2  clan_deposit_resource: RPC cộng tài nguyên NGUYÊN TỬ (thay read-modify-write ở JS)
-- LƯU Ý: create-or-replace RESET search_path -> phải PIN lại inline để không lùi bước
--        vá bảo mật ở 0055/0062.
-- ============================================================

-- ---------- H9: sell_item ----------
create or replace function sell_item(p_user_id text, p_item_id text, p_quantity int default 1)
returns jsonb language plpgsql
set search_path = public
as $$
declare v_price bigint; v_qty int; v_gain bigint; v_upd int;
begin
    if p_quantity <= 0 then return jsonb_build_object('status','bad_quantity'); end if;

    select price into v_price from items where id = p_item_id;
    if v_price is null then return jsonb_build_object('status','no_item'); end if;

    -- Khóa dòng kho: hai lệnh bán cùng lúc bị tuần tự hóa -> không bán đúp.
    select quantity into v_qty from inventory
        where user_id = p_user_id and item_id = p_item_id for update;
    if v_qty is null or v_qty < p_quantity then return jsonb_build_object('status','no_have'); end if;

    v_gain := floor(v_price * 0.5) * p_quantity;  -- bán lại 50% giá

    -- Guard số lượng + kiểm row_count: credit ví CHỈ khi thực sự trừ được kho.
    update inventory set quantity = quantity - p_quantity
        where user_id = p_user_id and item_id = p_item_id and quantity >= p_quantity;
    get diagnostics v_upd = row_count;
    if v_upd = 0 then return jsonb_build_object('status','no_have'); end if;

    delete from inventory where user_id = p_user_id and item_id = p_item_id and quantity <= 0;
    update users set wallet = wallet + v_gain where user_id = p_user_id;

    return jsonb_build_object('status','ok','gain', v_gain);
end; $$;

-- ---------- H10: quest_claim ----------
create or replace function quest_claim(
    p_user_id text, p_quest_id text, p_key text, p_required bigint, p_reward bigint
)
returns text language plpgsql
set search_path = public
as $$
declare v_counters jsonb; v_claimed jsonb; v_cur bigint;
begin
    -- Khóa dòng tiến độ hôm nay -> chống nhận thưởng cùng 1 nhiệm vụ 2 lần (double-claim).
    select counters, claimed into v_counters, v_claimed
        from quest_progress where user_id = p_user_id and quest_date = current_date for update;

    v_counters := coalesce(v_counters, '{}'::jsonb);
    v_claimed  := coalesce(v_claimed, '{}'::jsonb);

    if v_claimed ? p_quest_id then return 'claimed'; end if;
    v_cur := coalesce((v_counters->>p_key)::bigint, 0);
    if v_cur < p_required then return 'not_done'; end if;

    insert into quest_progress (user_id, quest_date, claimed)
        values (p_user_id, current_date, jsonb_build_object(p_quest_id, true))
    on conflict (user_id, quest_date) do update
        set claimed = quest_progress.claimed || jsonb_build_object(p_quest_id, true);

    insert into users (user_id) values (p_user_id) on conflict (user_id) do nothing;
    update users set wallet = wallet + p_reward where user_id = p_user_id;
    return 'ok';
end; $$;

-- ---------- M7: consume_ai_quota ----------
create or replace function consume_ai_quota(p_user_id text, p_free int, p_premium int)
returns jsonb language plpgsql
set search_path = public
as $$
declare v_used int; v_date date; v_prem timestamptz; v_cap int; v_is_prem boolean; v_today date := current_date;
begin
    insert into users(user_id) values(p_user_id) on conflict(user_id) do nothing;
    -- Khóa dòng user -> hai lượt AI đồng thời không cùng đọc ai_used cũ rồi vượt cap.
    select ai_used, ai_used_date, premium_until into v_used, v_date, v_prem
        from users where user_id=p_user_id for update;

    v_is_prem := (v_prem is not null and v_prem > now());
    v_cap := case when v_is_prem then p_premium else p_free end;

    if v_date is distinct from v_today then v_used := 0; end if;

    if v_used >= v_cap then
        return jsonb_build_object('allowed', false, 'used', v_used, 'cap', v_cap, 'premium', v_is_prem);
    end if;

    update users set ai_used = v_used + 1, ai_used_date = v_today where user_id=p_user_id;
    return jsonb_build_object('allowed', true, 'used', v_used + 1, 'cap', v_cap, 'premium', v_is_prem);
end; $$;

-- ---------- M2: clan_deposit_resource (nguyên tử) ----------
-- Cộng p_amount tài nguyên p_item_id vào kho bang trong 1 UPDATE (khóa dòng),
-- thay cho read-modify-write ở JS (mất contribution khi 2 thành viên nạp cùng lúc).
create or replace function clan_deposit_resource(p_clan_id bigint, p_item_id text, p_amount bigint)
returns jsonb language plpgsql
set search_path = public
as $$
declare v_res jsonb;
begin
    if p_amount <= 0 then return null; end if;
    update clans
       set resources = jsonb_set(
           coalesce(resources, '{}'::jsonb),
           array[p_item_id],
           to_jsonb(coalesce((resources->>p_item_id)::bigint, 0) + p_amount),
           true)
     where id = p_clan_id
     returning resources into v_res;
    return v_res; -- null nếu không có bang khớp
end; $$;

-- Đồng bộ quyền: chỉ service_role gọi (giống các RPC kinh tế khác đã REVOKE ở 0054).
revoke all on function clan_deposit_resource(bigint, text, bigint) from anon, authenticated;

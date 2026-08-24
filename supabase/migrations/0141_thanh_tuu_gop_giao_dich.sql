-- ============================================================
-- 0141_thanh_tuu_gop_giao_dich.sql — Gộp MỞ KHOÁ + TRẢ THƯỞNG thành MỘT giao dịch.
--
-- VẤN ĐỀ: `/achievements` làm hai việc bằng hai lời gọi rời nhau:
--     unlockAchievements(userId, ids)   -> ghi nhận vào bảng `achievements`
--     addMoney(userId, reward)          -> cộng tiền
-- Chết giữa hai bước, hoặc bước hai lỗi, là mất tiền VĨNH VIỄN: thành tựu đã ghi nhận thì
-- không mở lại được, nên chạy `/achievements` lần nữa cũng KHÔNG trao lại. Không có đường đòi.
--
-- Quy mô: 30 thành tựu có thưởng, tổng 446.000 xu, mốc lớn nhất 100.000 — gần 1/5 toàn bộ
-- cung tiền server lúc đo (505.755 xu). Chưa từng xảy ra (24-08: 6 lượt mở khoá / 4 người,
-- các lượt sau khi có sổ cái đều có dòng trả tiền khớp giờ), nhưng nó là lỗi CÂM.
--
-- `eeeb151` đã vá phần NÓI DỐI (không còn khẳng định "đã nhận X xu" khi cộng tiền hỏng).
-- Migration này vá phần MẤT TIỀN.
--
-- ⚠️ TUYỆT ĐỐI KHÔNG đảo thứ tự thành trả-tiền-trước-ghi-nhận-sau. Khi đó cộng tiền xong mà
-- ghi nhận hỏng sẽ cho phép chạy lại và nhận tiền LẦN NỮA — biến thành máy in tiền, tệ hơn
-- hẳn lỗi đang sửa. Hàm dưới đây ghi nhận TRƯỚC rồi mới cộng tiền, và vì cả hai nằm trong
-- cùng một hàm plpgsql (một giao dịch), cộng tiền lỗi thì ghi nhận cũng bị cuộn lại.
-- Cổng `test/thanh_tuu_khong_khang_dinh_sai.test.js` chốt thứ tự này.
--
-- VÌ SAO TRẢ THƯỞNG THEO `p_rewards` DO PHÍA GỌI TRUYỀN: bảng giá trị thưởng sống trong
-- `src/data/achievements.js` (JS), không có trong DB. Nhân đôi nó xuống SQL là tạo nguồn
-- sự thật thứ hai — đúng lớp lỗi đã sinh ra sự cố chợ 2026-08 (giá ở ba nơi). Trust model
-- này giống `increment_balance` vốn cũng nhận `p_amount` từ phía gọi, và an toàn vì hàm
-- CHỈ service_role gọi được (xem phần thu quyền cuối tệp).
--
-- SỔ CÁI: `economy_ledger` được ghi bằng TRIGGER trên `users`, không phải bằng lời gọi
-- tường minh. Nên chỉ cần `set_config('app.ledger_source', ...)` trước khi UPDATE, y như
-- `increment_balance` làm. Thiếu dòng đó thì tiền vẫn vào ví nhưng sổ cái mất dấu nguồn.
-- ============================================================

create or replace function public.unlock_achievements_with_reward(
    p_user_id text,
    p_rewards  jsonb          -- { "<achievement_id>": <xu>, ... } — chỉ chứa ứng viên vừa đạt
)
returns jsonb                 -- { "unlocked": [id...], "paid": <xu> }
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
    v_new    text[];
    v_total  bigint := 0;
    v_am     bigint;
begin
    if p_user_id is null or p_user_id = '' or p_rewards is null or p_rewards = '{}'::jsonb then
        return jsonb_build_object('unlocked', '[]'::jsonb, 'paid', 0);
    end if;

    -- Chặn giá trị thưởng ÂM: phía gọi truyền số nên đây là biên tin cậy duy nhất.
    -- Thưởng âm sẽ trừ ví người chơi khi họ vừa đạt thành tựu — cùng lớp với 0107.
    select min((value)::bigint) into v_am from jsonb_each_text(p_rewards);
    if v_am < 0 then
        raise exception 'Thuong thanh tuu khong duoc am (nho nhat: %)', v_am;
    end if;

    insert into users (user_id) values (p_user_id) on conflict (user_id) do nothing;

    -- 1) GHI NHẬN TRƯỚC. `on conflict do nothing ... returning` chỉ trả về dòng THỰC SỰ vừa
    --    chèn, nên hai lời gọi `/achievements` đua nhau không thể trao thưởng hai lần.
    with da_chen as (
        insert into achievements (user_id, achievement_id)
        select p_user_id, key from jsonb_each(p_rewards)
        on conflict (user_id, achievement_id) do nothing
        returning achievement_id
    )
    select coalesce(array_agg(achievement_id), '{}'::text[]) into v_new from da_chen;

    if array_length(v_new, 1) is null then
        return jsonb_build_object('unlocked', '[]'::jsonb, 'paid', 0);
    end if;

    -- 2) Tổng thưởng CHỈ của các id vừa chèn — không phải của toàn bộ ứng viên gửi lên.
    select coalesce(sum((p_rewards->>a)::bigint), 0) into v_total from unnest(v_new) as a;

    if v_total > 0 then
        perform set_config('app.ledger_source', 'achievements', true);
        update users set wallet = wallet + v_total where user_id = p_user_id;
        if not found then
            -- Không thể xảy ra (đã upsert user ở trên), nhưng nếu xảy ra thì PHẢI nổ để
            -- cuộn lại phần ghi nhận. Trả về êm ở đây là tái tạo đúng lỗi đang sửa.
            raise exception 'Khong cong duoc thuong cho user %', p_user_id;
        end if;
    end if;

    return jsonb_build_object('unlocked', to_jsonb(v_new), 'paid', v_total);
end;
$function$;

comment on function public.unlock_achievements_with_reward(text, jsonb) is
    'Mở khoá thành tựu + trả thưởng trong MỘT giao dịch. Ghi nhận trước, cộng tiền sau — đảo lại là máy in tiền. Xem 0141.';

-- Thu quyền: Postgres mặc định cho PUBLIC quyền EXECUTE trên hàm vừa tạo, nên phải REVOKE
-- tường minh. Bỏ bước này thì khoá công khai trong bundle web gọi được hàm ghi tiền —
-- đúng lỗ hổng mà 0137/0138 vừa bịt. Cổng `scripts/check-rpc-anon.js` hỏi thẳng DB nên nó
-- sẽ chặn push nếu thiếu.
revoke all on function public.unlock_achievements_with_reward(text, jsonb) from public, anon, authenticated;
grant execute on function public.unlock_achievements_with_reward(text, jsonb) to service_role;

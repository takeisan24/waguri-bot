-- ============================================================
-- 0108_clan_loan_row_locks.sql — Khoá hàng cho quỹ clan & khoản vay
--
-- Tìm ra ở lượt quét CÓ HỆ THỐNG 55 RPC ghi tiền (spec: docs/spec-audit-money-surface.md).
-- Các lượt trước lấy mẫu nên bỏ sót; lượt này liệt kê nên thấy.
--
-- 🟠 HIGH — clan_withdraw / clan_disband: TẠO TIỀN
--   Cả hai đọc `clans.bank` vào biến rồi cộng thẳng vào ví, KHÔNG khoá hàng:
--       select leader_id, bank into v_leader, v_bank from clans where id = v_clan;
--       ...
--       update users set wallet = wallet + v_bank where user_id = p_user;
--   Hai lời gọi song song (bấm nhanh 2 lần / 2 thiết bị) cùng đọc v_bank = X rồi
--   cùng cộng X => người chơi nhận 2X trong khi quỹ chỉ có X. TIỀN SINH RA TỪ KHÔNG KHÍ.
--   clan_withdraw còn làm `update clans set bank = bank - p_amount` không guard
--   => quỹ clan xuống ÂM.
--   Đáng chú ý: `clan_war` TRONG CÙNG NHÓM đã có FOR UPDATE — nên đây là bỏ sót,
--   không phải quy ước của hệ thống.
--
-- 🟡 MEDIUM — loan_repay / loan_collect: TRẢ TIỀN HAI LẦN
--   Đọc ví + tổng nợ vào biến, tính v_pay, rồi chuyển tiền. Hai lời gọi song song
--   cùng tính v_pay từ số liệu cũ => người vay bị trừ 2× cho một khoản nợ, bảng
--   `loans` chỉ ghi nhận 1 lần (vòng lặp sau đọc lại thì đã 'paid').
--   Không tạo tiền (là chuyển khoản) nhưng người vay MẤT TIỀN oan.
--   Đưa vào cùng migration vì chi phí biên gần bằng 0 và đây là đường tiền thật
--   (`/vay tra`, `/vay doi`).
--
-- ✅ prod hiện có 0 clan và 0 khoản vay active -> chưa ai trúng.
--
-- 📋 KẾT LUẬN QUÉT (55 RPC ghi tiền):
--   · 9 hàm an toàn nhờ UPDATE tự guard trong WHERE + row-count (tự kiểm nguyên tử)
--   · craft_item / hospital_heal / repair_tool / charge_assets có đua nhưng CHECK
--     constraint của 0107 (wallet>=0, quantity>=0) biến hỏng-âm-thầm thành lỗi-ồn-ào
--   · xoso_resolve thiếu chống lặp NHƯNG tính năng đang ngủ (không code nào gọi)
--     -> ghi backlog, không sửa trong lượt này theo đúng quy tắc dừng
--   · 4 hàm dưới đây là phần cần sửa
--
-- Mọi thân hàm dựng lại từ `pg_get_functiondef()` của bản ĐANG CHẠY TRÊN PROD,
-- chỉ thêm `for update` — không viết lại từ trí nhớ (bài học delete_user_data).
-- Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION public.clan_withdraw(p_user text, p_amount bigint)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_clan bigint; v_leader text; v_bank bigint;
begin
    -- Thứ tự khoá THỐNG NHẤT users -> clans ở cả hai hàm, tránh deadlock chéo.
    select clan_id into v_clan from users where user_id = p_user for update;
    if v_clan is null then return jsonb_build_object('status','not_in'); end if;
    -- + for update: khoá hàng clan tới hết transaction, hai lời gọi song song phải xếp hàng
    select leader_id, bank into v_leader, v_bank from clans where id = v_clan for update;
    -- Hàng clan có thể đã bị lời gọi trước xoá (disband) -> v_leader NULL.
    -- `NULL <> p_user` cho NULL chứ KHÔNG phải TRUE, nên nếu không chặn ở đây thì
    -- nhánh not_leader bị bỏ qua và hàm rơi xuống "ok" — thành công giả.
    if v_leader is null then return jsonb_build_object('status','not_in'); end if;
    if v_leader <> p_user then return jsonb_build_object('status','not_leader'); end if;
    if v_bank < p_amount then return jsonb_build_object('status','poor_clan','bank', v_bank); end if;
    update clans set bank = bank - p_amount where id = v_clan;
    update users set wallet = wallet + p_amount where user_id = p_user;
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
    update users set clan_id = null where clan_id = v_clan;
    if v_bank > 0 then update users set wallet = wallet + v_bank where user_id = p_user; end if;
    delete from clans where id = v_clan;
    return jsonb_build_object('status','ok','refund', v_bank);
end; $function$;

CREATE OR REPLACE FUNCTION public.loan_repay(p_borrower text, p_lender text, p_amount bigint)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_wallet bigint; v_total bigint; v_pay bigint; v_left bigint; rec record;
begin
    -- + for update: khoá ví người vay trước khi quyết định số tiền trả
    select wallet into v_wallet from users where user_id = p_borrower for update;
    v_wallet := coalesce(v_wallet, 0);
    select coalesce(sum(remaining),0) into v_total from loans where borrower_id=p_borrower and lender_id=p_lender and status='active';
    if v_total = 0 then return jsonb_build_object('status','none'); end if;

    v_pay := least(p_amount, v_total, v_wallet);
    if v_pay <= 0 then return jsonb_build_object('status','poor','remaining', v_total); end if;

    update users set wallet = wallet - v_pay where user_id = p_borrower;
    update users set wallet = wallet + v_pay where user_id = p_lender;

    v_left := v_pay;
    for rec in select id, remaining from loans where borrower_id=p_borrower and lender_id=p_lender and status='active' order by created_at loop
        exit when v_left <= 0;
        if rec.remaining <= v_left then
            update loans set remaining = 0, status = 'paid' where id = rec.id;
            v_left := v_left - rec.remaining;
        else
            update loans set remaining = remaining - v_left where id = rec.id;
            v_left := 0;
        end if;
    end loop;

    select coalesce(sum(remaining),0) into v_total from loans where borrower_id=p_borrower and lender_id=p_lender and status='active';
    return jsonb_build_object('status','ok','paid', v_pay, 'remaining', v_total);
end; $function$;

CREATE OR REPLACE FUNCTION public.loan_collect(p_lender text, p_borrower text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_overdue bigint; v_wallet bigint; v_bank bigint; v_take bigint; v_from_w bigint; v_from_b bigint; v_left bigint; rec record;
begin
    select coalesce(sum(remaining),0) into v_overdue from loans
        where lender_id=p_lender and borrower_id=p_borrower and status='active' and due_at <= now();
    if v_overdue = 0 then return jsonb_build_object('status','not_overdue'); end if;

    -- + for update: khoá ví người vay trước khi tính số cưỡng chế thu
    select wallet, bank into v_wallet, v_bank from users where user_id = p_borrower for update;
    v_wallet := coalesce(v_wallet,0); v_bank := coalesce(v_bank,0);
    v_take := least(v_overdue, v_wallet + v_bank);
    if v_take <= 0 then return jsonb_build_object('status','broke','overdue', v_overdue); end if;

    v_from_w := least(v_wallet, v_take);
    v_from_b := v_take - v_from_w;
    update users set wallet = wallet - v_from_w, bank = bank - v_from_b where user_id = p_borrower;
    update users set wallet = wallet + v_take where user_id = p_lender;

    v_left := v_take;
    for rec in select id, remaining from loans where lender_id=p_lender and borrower_id=p_borrower and status='active' and due_at <= now() order by created_at loop
        exit when v_left <= 0;
        if rec.remaining <= v_left then
            update loans set remaining = 0, status = 'paid' where id = rec.id;
            v_left := v_left - rec.remaining;
        else
            update loans set remaining = remaining - v_left where id = rec.id;
            v_left := 0;
        end if;
    end loop;

    return jsonb_build_object('status','ok','collected', v_take, 'from_wallet', v_from_w, 'from_bank', v_from_b, 'overdue_left', v_overdue - v_take);
end; $function$;

-- Chốt chặn tầng dữ liệu, cùng cách 0107 làm cho users/inventory.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='clans_bank_non_negative') THEN
        ALTER TABLE public.clans ADD CONSTRAINT clans_bank_non_negative CHECK (bank >= 0);
    END IF;
END $$;

-- ============================================================
-- VERIFY:
--   SELECT proname, prosrc ~* 'from clans where id = v_clan for update' AS da_khoa
--   FROM pg_proc WHERE proname IN ('clan_withdraw','clan_disband');       -- true, true
--   SELECT proname, prosrc ~* 'for update' AS da_khoa
--   FROM pg_proc WHERE proname IN ('loan_repay','loan_collect');          -- true, true
--   SELECT conname FROM pg_constraint WHERE conname='clans_bank_non_negative';
-- ============================================================

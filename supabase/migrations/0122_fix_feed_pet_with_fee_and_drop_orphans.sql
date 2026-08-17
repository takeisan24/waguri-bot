-- ============================================================
-- 0122 — Sửa `feed_pet_with_fee` gọi nhầm bảng + dọn hai hàm mồ côi của hệ xổ số cũ.
--
-- ── A. LỖI SỐNG: /pet feed food:money chưa từng chạy được ────────────────────────────────
-- `feed_pet_with_fee` tham chiếu bảng `pets`, nhưng bảng thú cưng thật tên `user_pets`
-- (hàm anh em `feed_pet` dùng đúng tên này). Mỗi lời gọi ném `relation "pets" does not
-- exist [42P01]` ngay ở dòng kiểm tra pet tồn tại.
--
-- Đường đi của lỗi tới người dùng: `db.feedPetWithFee()` bắt exception rồi trả `null`
-- (src/database.js:1052), `pet.js:164` thấy null nên hiện `err_system`. Nghĩa là người chơi
-- chọn cho ăn bằng tiền thì luôn nhận "lỗi hệ thống", không phải "hết tiền".
--
-- TIỀN CÓ MẤT KHÔNG: không. Lỗi xảy ra TRƯỚC lệnh `update users set wallet = ...`, và cả
-- hàm nằm trong một transaction nên có xảy ra sau cũng bị cuộn lại. Đây là lỗi TÍNH NĂNG
-- HỎNG, không phải lỗi thất thoát.
--
-- Bản sửa giữ nguyên hợp đồng trả về mà pet.js đang dựa vào: -1 = không đủ tiền,
-- -2 = chưa có pet, còn lại = exp mới. Thêm `fed_at = now()` cho khớp `feed_pet` — thiếu nó
-- thì hai đường cho ăn ghi dữ liệu khác nhau. Đồng thời ghim `search_path` thành
-- 'pg_catalog', 'public' theo chuẩn dự án; bản cũ chỉ có 'public', mà hàm lại là
-- SECURITY DEFINER nên để thiếu pg_catalog là rủi ro không cần thiết.
--
-- ── B. HAI HÀM MỒ CÔI: xoso_bet, xoso_resolve ───────────────────────────────────────────
-- `0037_ticket_lottery.sql:5-6` thay hệ xổ số cũ bằng vé số và `DROP TABLE xoso_bets,
-- xoso_results CASCADE`. Nhưng CASCADE trên bảng KHÔNG xoá hàm tham chiếu tới nó —
-- Postgres không theo dõi phụ thuộc bên trong thân hàm. Hai hàm nằm lại từ đó, chắc chắn
-- lỗi nếu ai gọi, và 0 nơi trong code gọi chúng.
--
-- Cũng chính vì mồ côi mà mục backlog "xoso_resolve thiếu tính bất biến" là mục sai đề:
-- không cần vá tính bất biến cho hàm mà bảng của nó đã biến mất — chỉ cần xoá hàm.
-- ============================================================

-- ── A ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.feed_pet_with_fee(p_user text, p_exp integer, p_cost bigint)
returns bigint
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
    v_wallet  bigint;
    v_new_exp bigint;
begin
    -- Khoá dòng user tới hết transaction (chống hai lời gọi song song cùng trừ tiền).
    select wallet into v_wallet from users where user_id = p_user for update;
    if v_wallet is null or v_wallet < p_cost then
        return -1;                      -- không đủ tiền
    end if;

    if not exists (select 1 from user_pets where user_id = p_user) then
        return -2;                      -- chưa có pet
    end if;

    update users set wallet = wallet - p_cost where user_id = p_user;
    update user_pets set exp = exp + p_exp, fed_at = now() where user_id = p_user
        returning exp into v_new_exp;

    return v_new_exp;
end;
$function$;

revoke all on function public.feed_pet_with_fee(text, integer, bigint) from public, anon, authenticated;
grant execute on function public.feed_pet_with_fee(text, integer, bigint) to service_role;

-- ── B ────────────────────────────────────────────────────────────────────────────────────
-- Chữ ký lấy từ `pg_get_function_identity_arguments` chứ không viết theo trí nhớ: sai một
-- kiểu thì `drop ... if exists` im lặng không xoá gì, và migration trông như đã thành công.
drop function if exists public.xoso_bet(text, integer, bigint, date);
drop function if exists public.xoso_resolve(date, integer, integer);

-- Chốt: sau khi chạy, hai hàm phải thực sự biến mất.
do $$
declare v_con int;
begin
    select count(*) into v_con
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('xoso_bet', 'xoso_resolve');
    if v_con > 0 then
        raise exception '[0122] Van con % ham xoso_* — chu ky drop khong khop.', v_con;
    end if;
end $$;

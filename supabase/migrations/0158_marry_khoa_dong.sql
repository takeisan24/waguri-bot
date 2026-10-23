-- ============================================================
-- 0158_marry_khoa_dong.sql — Khoá dòng cho kết hôn / ly hôn.
--
-- ⚠️ TRẠNG THÁI: ĐÃ VIẾT, **CHƯA ÁP** lên DB test lẫn prod (23/10/2026). Phiên viết file này
-- không có đường chạy DDL: tài khoản Supabase MCP đang nối chỉ thấy một project khác, repo
-- không có `pg`/`psql`, và các cổng `check-rpc-anon`/`check-db` chỉ gọi được RPC soi quyền
-- (0138) chứ không chạy SQL tuỳ ý. File này vì thế KHÔNG thay đổi gì cho tới khi được áp —
-- và không có mã JS nào phụ thuộc vào nó, nên để nằm chờ là an toàn.
-- Áp xong thì xoá khối ⚠️ này. Nếu có lỗi cú pháp thì lệnh áp sẽ báo đỏ và hàm CŨ vẫn
-- nguyên, không có đường hỏng âm thầm.
--
-- VÌ SAO CÓ. `marry_users` (0010) ĐỌC `partner_id` của hai người rồi mới GHI, mà lời đọc
-- không có `for update`:
--
--     select partner_id into a_p from users where user_id = p_a;   -- không khoá
--     select partner_id into b_p from users where user_id = p_b;   -- không khoá
--     if a_p is not null or b_p is not null then return 'already'; end if;
--     update users set partner_id = p_b ... ;
--
-- Hai lượt cưới chạm nhau trong khe giữa đọc và ghi thì CẢ HAI đều thấy `null` và cả hai
-- đều ghi -> A thành vợ/chồng của B trong khi B lại thành của C. Quan hệ một chiều kiểu đó
-- không có lệnh nào sửa được: `divorce_user` xoá theo `partner_id` của CHÍNH người gọi, nên
-- bên bị bỏ rơi vẫn trỏ sang người đã có đôi khác, và `marry_users` thì chặn họ cưới lại vì
-- `partner_id is not null`. Tức là kẹt vĩnh viễn, phải sửa tay trong DB.
--
-- `divorce_user` cùng hình dạng: đọc `partner_id` rồi mới `update`. Một lượt ly hôn chạm
-- một lượt cưới thì ly hôn xoá theo giá trị CŨ và bỏ sót phía mới.
--
-- QUY MÔ THẬT (đo prod 23/10, để ai đọc sau không tưởng đây là việc gấp): 4/1.073 tài khoản
-- đang có `partner_id`, tức 2 cặp trong suốt đời bot. Đua tranh cần hai lời cưới trùng nhau
-- trong vài milli giây nên xác suất thực tế gần 0. Vá vì nó ĐÚNG và rẻ, không vì nó đang
-- cháy — đừng dùng file này làm bằng chứng rằng kết hôn là bề mặt nóng.
--
-- KHOÁ THEO THỨ TỰ CỐ ĐỊNH, VÀ KHOÁ NGAY TRÊN CÂU ĐỌC. Hai điều riêng biệt, đều cần:
--   · `for update` phải nằm trên chính câu `select … into`. Khoá bằng một câu `perform`
--     riêng rồi đọc bằng câu trần là vẫn đúng về nghĩa, nhưng không ai đọc mã sau này thấy
--     được điều đó — và `scripts/check-sql-policy.js` (luật R3) quét theo TỪNG CÂU nên nó
--     báo đỏ, đúng kiểu cổng nên báo.
--   · Thứ tự khoá phải là `least`/`greatest` của hai user_id, KHÔNG phải thứ tự tham số.
--     Hai lượt ngược chiều (A cưới B, cùng lúc B cưới A) mà mỗi lượt khoá theo tham số của
--     mình thì khoá chéo nhau -> deadlock và Postgres huỷ một bên. Sắp theo user_id thì mọi
--     lượt khoá cùng một chiều, nên lượt sau chỉ việc xếp hàng.
--
-- `create or replace function` ĐẶT LẠI mọi thuộc tính không nêu trong định nghĩa mới, nên
-- phần `security definer` + `set search_path` + REVOKE/GRANT dưới đây phải được viết lại
-- đầy đủ — không nêu là mất lớp vá của 0054/0055/0137/0138. (0137 nêu đúng tên
-- `divorce_user` trong danh sách RPC từng gọi được bằng khoá công khai.)
-- ============================================================

-- ---------- Kết hôn ----------
create or replace function public.marry_users(p_a text, p_b text)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
    v_lo    text := least(p_a, p_b);
    v_hi    text := greatest(p_a, p_b);
    lo_p    text;
    hi_p    text;
    a_p     text;
    b_p     text;
begin
    if p_a = p_b then return 'self'; end if;
    insert into users(user_id) values (p_a) on conflict (user_id) do nothing;
    insert into users(user_id) values (p_b) on conflict (user_id) do nothing;

    -- Khoá + đọc trong CÙNG câu, theo thứ tự user_id tăng dần (không theo thứ tự tham số).
    -- Chốt thật nằm dưới hai lời khoá này; mọi phép kiểm phía trên chỉ là gợi ý.
    select partner_id into lo_p from users where user_id = v_lo for update;
    select partner_id into hi_p from users where user_id = v_hi for update;

    a_p := case when p_a = v_lo then lo_p else hi_p end;
    b_p := case when p_b = v_lo then lo_p else hi_p end;
    if a_p is not null or b_p is not null then return 'already'; end if;

    update users set partner_id = p_b, married_at = now() where user_id = p_a;
    update users set partner_id = p_a, married_at = now() where user_id = p_b;
    return 'ok';
end; $fn$;

-- ---------- Ly hôn ----------
create or replace function public.divorce_user(p_user text)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare v_p text;
begin
    -- Khoá NGAY trên câu đọc: đọc trước rồi khoá sau là vẫn dùng giá trị cũ.
    select partner_id into v_p from users where user_id = p_user for update;
    if v_p is null then return 'single'; end if;

    -- Khoá luôn dòng bạn đời rồi mới xoá hai phía, để một lượt cưới chen vào giữa không để
    -- lại quan hệ một chiều. Dùng `perform` chứ không `select … into` vì ở đây chỉ cần CÁI
    -- KHOÁ, không cần giá trị — gán vào một biến rồi không đọc là mã chết.
    perform 1 from users where user_id = v_p for update;

    update users set partner_id = null, married_at = null where user_id in (p_user, v_p);
    return 'ok';
end; $fn$;

-- ---------- Thu quyền (Postgres tự cấp PUBLIC EXECUTE cho hàm vừa replace) ----------
revoke all on function public.marry_users(text, text) from public, anon, authenticated;
grant execute on function public.marry_users(text, text) to service_role;

revoke all on function public.divorce_user(text) from public, anon, authenticated;
grant execute on function public.divorce_user(text) to service_role;

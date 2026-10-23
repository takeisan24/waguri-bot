-- ============================================================
-- 0158_marry_khoa_dong.sql — Khoá dòng cho kết hôn / ly hôn.
--
-- TRẠNG THÁI: ĐÃ ÁP 23/10/2026 lên **cả hai** DB — test `nipdwmdwugipjmrmhagb` và prod
-- `kuvlkaxregnanhzgqrbp` — và đã nghiệm thu bằng phép đua tranh thật (xem khối cuối file).
-- Trước khi áp, hai DB giống nhau từng byte (`md5(pg_get_functiondef)` khớp) nên không có
-- chuyện prod đã lệch sẵn so với repo.
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
-- `set search_path` + REVOKE/GRANT dưới đây phải được viết lại đầy đủ — không nêu là mất
-- lớp vá của 0054/0055/0137/0138. (0137 nêu đúng tên `divorce_user` trong danh sách RPC
-- từng gọi được bằng khoá công khai.)
--
-- CỐ Ý **KHÔNG** CÓ `security definer` — và đây là chỗ bản nháp đầu của file này đã SAI.
-- Nháp đó khai `security definer` vì tôi suy theo mẫu chung của các RPC nhạy cảm. Hỏi
-- thẳng DB (`pg_proc.prosecdef`) thì cả `marry_users` lẫn `divorce_user`, trên test LẪN
-- prod, đều là SECURITY INVOKER. Thêm definer vào đây là tự ý nâng quyền thực thi của một
-- hàm đang chạy tốt, trong khi nơi gọi duy nhất là `service_role` (vốn đã vượt RLS) nên
-- chẳng được gì. Luật rút ra: khi REPLACE một hàm đang sống thì ĐO thuộc tính cũ rồi giữ
-- nguyên, đừng suy từ mẫu của hàm khác.
-- ============================================================

-- ---------- Kết hôn ----------
create or replace function public.marry_users(p_a text, p_b text)
returns text
language plpgsql
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

-- ============================================================
-- NGHIỆM THU (23/10/2026, chạy thật trên test rồi prod)
--
-- 1. HÀNH VI KHÔNG ĐỔI — 15/15 phép thử khớp: `self` · cưới lần đầu `ok` + quan hệ hai
--    chiều đủ cả `married_at` · `already` ở CẢ BỐN tổ hợp (người đã cưới / còn rảnh × nằm
--    ở vị trí LO / HI) · `single` khi chưa cưới · ly hôn xoá CẢ HAI phía · gọi ly hôn từ
--    phía bên kia cũng xoá hai phía · cưới lại được sau khi ly hôn.
--
-- 2. KHOÁ CÓ THẬT, đo trực tiếp chứ không suy từ mã. Nhánh `already` KHÔNG ghi gì, nên
--    `xmax` của dòng người còn rảnh mà khác 0 thì chỉ có thể do `for update`. Và phép đo
--    này đã được BẺ NGƯỢC: hạ hàm về đúng bản cũ của 0010 rồi dò lại thì cùng phép đo đọc
--    ra `KHONG-KHOA`, trong khi bản này đọc ra `bi-khoa` — cả hai bản đều trả `already` y
--    nhau. Tức phép đo phân biệt được đúng thứ cần phân biệt, không phải bù nhìn.
--    (Phần hạ cấp + nâng lại nằm trong CÙNG một transaction nên không có khoảnh khắc nào
--    bản cũ được commit.)
--
-- 3. QUYỀN CÒN NGUYÊN sau khi replace: `anon` và `authenticated` đều KHÔNG gọi được,
--    `service_role` gọi được, `prosecdef = false`, `search_path` vẫn pin. `check-rpc-anon`
--    và `check-db` xác nhận độc lập trên cả hai DB. Hai DB khớp `md5(pg_get_functiondef)`.
--
-- 4. ĐO PROD TRƯỚC KHI ÁP: 4 dòng có `partner_id` = đúng 2 cặp, cả hai HAI CHIỀU ĐỦ —
--    chưa có cặp nào bị kẹt một chiều. Migration này là PHÒNG, không phải chữa.
--
-- GHI CHÚ ĐỌC MÃ: phép gán `a_p`/`b_p` ở trên chỉ để đọc cho rõ ai là ai. Chốt thật là
-- `a_p is not null or b_p is not null`, mà phép OR thì đối xứng, nên dù có đổi chỗ hai
-- biến kết quả cũng không khác. Đừng tưởng nó là chỗ dễ sai rồi "sửa" theo cảm giác.
-- ============================================================

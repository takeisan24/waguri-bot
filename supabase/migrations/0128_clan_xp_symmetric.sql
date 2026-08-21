-- ============================================================
-- 0128_clan_xp_symmetric.sql — Chặn farm XP bang bằng vòng lặp nạp/rút.
--
-- LỖI: `clan_deposit` (0034) cộng CẢ `bank` LẪN `xp`, nhưng `clan_withdraw`
-- (0030, vá khoá ở 0108) chỉ trừ `bank` — KHÔNG đụng `xp`. Nên:
--     /clan deposit 1000000   -> bank +1M, xp +1M
--     /clan withdraw 1000000  -> bank -1M, xp GIỮ NGUYÊN
-- lặp lại với chi phí ròng = 0, đẩy `xp` lên vô hạn. Cấp bang
-- = floor(sqrt(xp/10000)) + 1 nên cấp bang trở thành số bịa: hiển thị ở
-- /clan info, /clan list và /status, đồng thời quyết định tốc độ rút cổ tức
-- `cấp * 100`/người/ngày ra khỏi quỹ bang trong claim_daily (0081).
--
-- KHÔNG phải máy in tiền: từ 0081 cổ tức bị TRỪ TỪ QUỸ BANG và chặn trần ở
-- số dư quỹ, nên tiền chỉ được chia lại chứ không đúc mới. Hệ quả thật là
-- (a) cấp bang/BXH bịa được và (b) `clan_join` không có rào -> người lạ nhảy
-- vào bang cấp cao, hút quỹ nhanh gấp nhiều lần rồi rời đi.
--
-- CÁCH SỬA: cho `xp` đối xứng với `bank` trên đúng đường đi RÚT VỀ VÍ.
-- `xp` đổi nghĩa từ "tổng nạp tích luỹ" -> "đóng góp còn giữ lại".
-- CHỦ Ý không đụng các đường ra khác — cổ tức (0081), đền thờ (0082),
-- thua clan_war (0035): ở đó tiền đã được TIÊU thật, đóng góp là có thật,
-- nên bang xứng đáng giữ xp. Chỉ nạp-rồi-rút-về-ví mới là đóng góp giả.
--
-- KHÔNG hồi tố `xp` đã bị thổi: không có cách phân biệt xp farm với xp thật
-- (quỹ tiêu vào đền thờ/cổ tức cũng làm bank < xp). Kẹp lại sẽ phạt oan bang
-- đã tiêu tiền đúng mục đích.
-- ============================================================

-- Giữ NGUYÊN bản 0108 (thứ tự khoá users -> clans, guard v_leader IS NULL
-- chống thành-công-giả khi bang vừa bị disband), chỉ thêm phần trừ xp.
CREATE OR REPLACE FUNCTION public.clan_withdraw(p_user text, p_amount bigint)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_clan bigint; v_leader text; v_bank bigint;
begin
    if p_amount is null or p_amount <= 0 then
        return jsonb_build_object('status','bad_amount');
    end if;
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
    -- greatest(0, ...): xp có thể đã thấp hơn bank (cổ tức/đền thờ không trừ xp,
    -- thắng clan_war cộng bank mà không cộng xp) -> không cho xp âm.
    update clans
       set bank = bank - p_amount,
           xp   = greatest(0, xp - p_amount)
     where id = v_clan;
    update users set wallet = wallet + p_amount where user_id = p_user;
    return jsonb_build_object('status','ok');
end; $function$;

REVOKE ALL ON FUNCTION public.clan_withdraw(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clan_withdraw(text, bigint) TO service_role;

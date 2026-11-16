-- ============================================================
-- 0163_thu_nhap_ngay_ap_dai.sql — Lớp A: thu nhập chủ động (work/gather) giảm dần theo dải ngày
--
-- VẤN ĐỀ: lương `/work` và tiền `/fish /mine /chop` được cộng thẳng vào ví, không có tổng
-- ngày nào ở phía DB. Lặp lệnh đủ nhanh là in tiền không giới hạn.
--
-- CÁCH SỬA — MỘT RPC nguyên tử `nhan_thu_nhap_chu_dong`: cộng dồn tổng gross của ngày (giờ
-- VN), tính số được nhận theo bảng dải, và GHI VÍ trong cùng transaction (gọi
-- `increment_balance` để giữ nhãn nguồn của sổ cái, 0117). JS chỉ gọi helper và in đúng
-- số `net` trả về — không tự tính dải, không ghi ví lần hai.
--
-- BẢNG DẢI (hằng trong hàm — nguồn duy nhất), tính trên TỔNG GROSS đã nhận trong ngày:
--     0 – 100.000          ×1
--     100.000 – 300.000    ×0,5
--     300.000 – 1.000.000  ×0,1
--     trên 1.000.000       min(phần trên 1M của lượt × 0,1 ; 400)
-- Một lượt vắt qua mốc được tính TỪNG KHÚC trên đoạn [tong_truoc, tong_truoc + p_gross).
-- Mọi khúc tính bằng numeric chính xác, cộng lại rồi mới floor MỘT lần — floor từng khúc
-- có thể lệch 1 xu ở lượt vắt mốc và phá tính đơn điệu (cùng gross, tổng càng cao thì số
-- nhận không bao giờ tăng).
--
-- p_mode:
--   'enforce' -> ghi ví net_tinh
--   'log'     -> ghi ví ĐỦ p_gross (không ai thiệt), nhưng vẫn cộng dồn và trả net_tinh để
--                bot ghi log so sánh trước khi bật 'enforce'.
--
-- NGÀY = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date. KHÔNG dùng ngày hiện tại của máy
-- chủ như `claim_daily_counter` (0041): Supabase chạy giờ UTC nên cách đó đổi ngày lúc
-- 07:00 giờ VN. Mẫu đúng: 0154.
--
-- BỘ ĐẾM: bảng `daily_counters` (0041, PK (user_id, key), count INT), khoá mới
-- `thu_nhap_ngay`. Cột là INT nên cộng bằng BIGINT rồi kẹp 2147483647 ở CẢ nhánh VALUES
-- lẫn DO UPDATE — không tràn, không hỏng transaction.
--
-- tong_truoc PHẢI ĐÚNG kể cả khi bộ đếm bị kẹp: đọc-có-khoá (FOR UPDATE) trước, rồi mới
-- upsert. Hàng chưa có (lượt đầu tiên của người đó, có thể hai lượt cùng tới): không có gì
-- để khoá, nên lấy tong_truoc = count sau upsert − p_gross — đúng tuyệt đối vì lúc đó
-- không thể bị kẹp (count ≤ 2 × 10.000.000).
--
-- LỖI: tham số sai -> RAISE (SQLSTATE 22023). `increment_balance` trả NULL (không ghi
-- được ví) -> RAISE để ROLLBACK luôn bộ đếm: không có chuyện đã đếm mà chưa trả.
--
-- BẢO MẬT (luật 4): SECURITY INVOKER, pin search_path, chỉ service_role được gọi.
-- Đường lùi: supabase/rollback/lui_0163_thu_nhap_ngay.sql (NGOÀI thư mục migrations).
--
-- Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION public.nhan_thu_nhap_chu_dong(
    p_user_id text,
    p_gross   bigint,
    p_source  text,
    p_mode    text
)
RETURNS TABLE(net bigint, net_tinh bigint, tong_truoc bigint, tong_sau bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
declare
    c_khoa     constant text    := 'thu_nhap_ngay';
    c_int_max  constant bigint  := 2147483647;
    c_moc_1    constant bigint  := 100000;
    c_moc_2    constant bigint  := 300000;
    c_moc_3    constant bigint  := 1000000;
    c_san      constant numeric := 400;
    v_ngay     date;
    v_cu       bigint;
    v_truoc    bigint;
    v_sau      bigint;
    v_cuoi     bigint;
    v_net_tinh bigint;
    v_ghi      bigint;
    v_so_du    bigint;
begin
    if p_user_id is null or p_user_id = '' then
        raise exception 'nhan_thu_nhap_chu_dong: thieu p_user_id' using errcode = '22023';
    end if;
    if p_gross is null or p_gross <= 0 or p_gross > 10000000 then
        raise exception 'nhan_thu_nhap_chu_dong: p_gross ngoai khoang (0, 10000000]: %', p_gross
            using errcode = '22023';
    end if;
    if p_source is null or p_source not in ('work', 'gather') then
        raise exception 'nhan_thu_nhap_chu_dong: p_source khong hop le: %', p_source
            using errcode = '22023';
    end if;
    if p_mode is null or p_mode not in ('log', 'enforce') then
        raise exception 'nhan_thu_nhap_chu_dong: p_mode khong hop le: %', p_mode
            using errcode = '22023';
    end if;

    v_ngay := (now() at time zone 'Asia/Ho_Chi_Minh')::date;

    -- 1) Khoá hàng bộ đếm (nếu đã có) và đọc tổng TRƯỚC lượt này. Khác ngày VN = 0.
    select case when d.day = v_ngay then d.count::bigint else 0 end
      into v_cu
      from public.daily_counters d
     where d.user_id = p_user_id and d.key = c_khoa
       for update;

    -- 2) Cộng dồn nguyên tử. Hai lượt đầu tiên tới cùng lúc: lượt sau chờ ở đây rồi rơi
    --    vào DO UPDATE, không lượt nào bị đếm thiếu.
    insert into public.daily_counters as d (user_id, key, day, count)
    values (p_user_id, c_khoa, v_ngay, least(p_gross, c_int_max)::int)
    on conflict (user_id, key) do update
       set count = least(
                       (case when d.day = v_ngay then d.count else 0 end)::bigint + p_gross,
                       c_int_max
                   )::int,
           day   = v_ngay
    returning d.count into v_sau;

    v_truoc := coalesce(v_cu, v_sau - p_gross);
    v_cuoi  := v_truoc + p_gross;

    -- 3) Tính từng khúc trên [v_truoc, v_cuoi), numeric chính xác, floor MỘT lần ở cuối.
    v_net_tinh := floor(
          greatest(least(v_cuoi, c_moc_1) - v_truoc, 0)                    * 1.0
        + greatest(least(v_cuoi, c_moc_2) - greatest(v_truoc, c_moc_1), 0) * 0.5
        + greatest(least(v_cuoi, c_moc_3) - greatest(v_truoc, c_moc_2), 0) * 0.1
        + least(greatest(v_cuoi - greatest(v_truoc, c_moc_3), 0) * 0.1, c_san)
    )::bigint;

    v_ghi := case when p_mode = 'enforce' then v_net_tinh else p_gross end;

    -- 4) Ghi ví trong CÙNG transaction. NULL = không ghi được -> rollback cả bộ đếm.
    v_so_du := public.increment_balance(p_user_id, 'wallet', v_ghi, p_source);
    if v_so_du is null then
        raise exception 'nhan_thu_nhap_chu_dong: khong ghi duoc vi (user %, so %)', p_user_id, v_ghi;
    end if;

    net        := v_ghi;
    net_tinh   := v_net_tinh;
    tong_truoc := v_truoc;
    tong_sau   := v_sau;
    return next;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.nhan_thu_nhap_chu_dong(text, bigint, text, text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.nhan_thu_nhap_chu_dong(text, bigint, text, text) TO service_role;

-- ============================================================
-- VERIFY (trên waguri-test, người dùng tạm; số = cột net_tinh):
--   tổng 95.000  + gross 20.000 -> 12.500      tổng 999.000 + gross 10.000 -> 500
--   tổng 999.500 + gross 2.000  -> 200         tổng ≥ 1M: 7.500 -> 400 · 3.250 -> 325 · 77 -> 7
--   'log': ví +gross, net = gross;  'enforce': ví +net_tinh, net = net_tinh
--   hàng có day = hôm qua -> tong_truoc = 0, count = gross mới
--   has_function_privilege('anon', 'public.nhan_thu_nhap_chu_dong(text,bigint,text,text)', 'execute') = false
-- ============================================================

-- ============================================================
-- 0155_telemetry_ngay_bat_dau.sql — Thêm mốc "dữ liệu telemetry có từ ngày nào".
--
-- VÌ SAO CÓ: Cổng 3 (docs/daily-checklist.md) phán "0 lượt gọi trong 14 ngày liên tiếp ->
-- watchlist, 30 ngày -> khai tử". Bảng `command_telemetry` vừa sinh ra ở 0154 nên đang
-- TRỐNG. Nếu cứ thế mà tính thì cả 73 lệnh đều "0 lượt trong 30 ngày" -> đề nghị khai tử
-- sạch bot. Đó là dương tính giả do thiếu dữ liệu, không phải do lệnh chết.
--
-- `ngay_bat_dau` = ngày sớm nhất CÓ dữ liệu trong bảng (không phụ thuộc cửa sổ truy vấn).
-- Người gọi so với nó để biết lịch sử đã đủ 14/30 ngày chưa, chỉ phán khi đã đủ.
-- NULL = chưa có dòng nào.
-- ============================================================

CREATE OR REPLACE FUNCTION public.telemetry_lenh_cua_so(p_days integer DEFAULT 1)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
    WITH tham AS (
        SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - (greatest(coalesce(p_days, 1), 1) - 1) AS tu_ngay
    ),
    per AS (
        SELECT t.command,
               sum(t.calls)  AS calls,
               sum(t.errors) AS errors,
               (SELECT count(DISTINCT cu.user_id)
                  FROM public.command_telemetry_users cu, tham
                 WHERE cu.command = t.command AND cu.day >= tham.tu_ngay) AS users
          FROM public.command_telemetry t, tham
         WHERE t.day >= tham.tu_ngay
         GROUP BY t.command
    )
    SELECT jsonb_build_object(
        'days',         greatest(coalesce(p_days, 1), 1),
        'from_day',     (SELECT tu_ngay FROM tham),
        'ngay_bat_dau', (SELECT min(day) FROM public.command_telemetry),
        'total_calls',  coalesce((SELECT sum(calls)  FROM per), 0),
        'total_errors', coalesce((SELECT sum(errors) FROM per), 0),
        'unique_users', coalesce((SELECT count(DISTINCT cu.user_id)
                                    FROM public.command_telemetry_users cu, tham
                                   WHERE cu.day >= tham.tu_ngay), 0),
        'commands',     coalesce((SELECT jsonb_agg(jsonb_build_object(
                                            'name',   command,
                                            'calls',  calls,
                                            'errors', errors,
                                            'users',  users)
                                         ORDER BY calls DESC, command)
                                    FROM per), '[]'::jsonb)
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.telemetry_lenh_cua_so(integer) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.telemetry_lenh_cua_so(integer) TO service_role;

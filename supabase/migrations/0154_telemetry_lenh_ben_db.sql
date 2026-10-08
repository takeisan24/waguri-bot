-- ============================================================
-- 0154_telemetry_lenh_ben_db.sql — Đưa telemetry lệnh từ RAM xuống DB.
--
-- VÌ SAO CÓ: audit 2026-10-08. `src/lib/commandTelemetry.js` đếm trong một Map ở RAM,
-- `exportTelemetrySnapshot()` chỉ TRẢ VỀ object (không ai ghi đi đâu), hook SIGTERM chỉ
-- gán `lastFlushTime`, và `commandStats.clear()` khi sang ngày. Hệ quả:
--   · Cổng 2 (tỷ lệ lỗi) reset về 0 mỗi lần bot restart.
--   · Cổng 3 hứa "lệnh 0 lượt trong 14 ngày liên tiếp -> watchlist, 30 ngày -> khai tử"
--     mà KHÔNG CÓ nơi nào giữ dữ liệu quá một ngày. Quy trình trong
--     docs/daily-checklist.md vì thế là giấy tờ, không phải phép đo.
--
-- THIẾT KẾ:
--   · `command_telemetry`        — một dòng/(ngày, lệnh): calls + errors (cộng dồn).
--   · `command_telemetry_users`  — (ngày, lệnh, user) để đếm người dùng DUY NHẤT đúng,
--     kể cả khi bot restart nhiều lần trong ngày. Ở quy mô này bảng rất nhỏ
--     (số lệnh × số người/ngày), và đó là cách duy nhất đếm unique không sai sau restart.
--   · `ghi_telemetry_lenh(jsonb)` nhận PHẦN TĂNG THÊM (delta) rồi `+=`, không ghi đè số
--     tuyệt đối. Bắt buộc phải vậy: sau restart bộ đếm RAM về 0, ghi đè sẽ xoá mất số
--     đã tích luỹ của ngày hôm đó.
--
-- Ngày chốt theo GIỜ VIỆT NAM (Asia/Ho_Chi_Minh) để khớp mốc ngày mà bot đang dùng.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.command_telemetry (
    day     date   NOT NULL,
    command text   NOT NULL,
    calls   bigint NOT NULL DEFAULT 0,
    errors  bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (day, command)
);

CREATE TABLE IF NOT EXISTS public.command_telemetry_users (
    day     date NOT NULL,
    command text NOT NULL,
    user_id text NOT NULL,
    PRIMARY KEY (day, command, user_id)
);

CREATE INDEX IF NOT EXISTS idx_command_telemetry_day       ON public.command_telemetry (day DESC);
CREATE INDEX IF NOT EXISTS idx_command_telemetry_users_day ON public.command_telemetry_users (day DESC);

ALTER TABLE public.command_telemetry       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.command_telemetry_users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.command_telemetry       FROM anon, authenticated;
REVOKE ALL ON public.command_telemetry_users FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.command_telemetry       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.command_telemetry_users TO service_role;

-- --- Ghi phần tăng thêm ---------------------------------------
CREATE OR REPLACE FUNCTION public.ghi_telemetry_lenh(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
    r        jsonb;
    v_day    date;
    v_cmd    text;
    v_calls  bigint;
    v_errors bigint;
    v_users  jsonb;
    v_n      int := 0;
BEGIN
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'p_rows phai la mang');
    END IF;

    FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
        v_cmd := nullif(btrim(r->>'command'), '');
        CONTINUE WHEN v_cmd IS NULL;

        v_day    := coalesce((r->>'day')::date, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
        v_calls  := greatest(coalesce((r->>'calls')::bigint, 0), 0);
        v_errors := greatest(coalesce((r->>'errors')::bigint, 0), 0);

        IF v_calls > 0 OR v_errors > 0 THEN
            INSERT INTO public.command_telemetry (day, command, calls, errors)
            VALUES (v_day, v_cmd, v_calls, v_errors)
            ON CONFLICT (day, command) DO UPDATE
               SET calls  = public.command_telemetry.calls  + excluded.calls,
                   errors = public.command_telemetry.errors + excluded.errors;
        END IF;

        v_users := r->'users';
        IF v_users IS NOT NULL AND jsonb_typeof(v_users) = 'array' THEN
            INSERT INTO public.command_telemetry_users (day, command, user_id)
            SELECT v_day, v_cmd, u
              FROM jsonb_array_elements_text(v_users) AS u
             WHERE nullif(btrim(u), '') IS NOT NULL
            ON CONFLICT (day, command, user_id) DO NOTHING;
        END IF;

        v_n := v_n + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'rows', v_n);
END;
$function$;

-- --- Đọc theo cửa sổ N ngày (Cổng 2 + Cổng 3) -----------------
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

-- --- Dọn sổ cũ ------------------------------------------------
CREATE OR REPLACE FUNCTION public.don_telemetry_lenh(p_keep_days integer DEFAULT 180)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
    v_moc date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - greatest(coalesce(p_keep_days, 180), 30);
    v_xoa bigint := 0;
    v_tmp bigint := 0;
BEGIN
    DELETE FROM public.command_telemetry_users WHERE day < v_moc;
    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_xoa := v_xoa + v_tmp;

    DELETE FROM public.command_telemetry WHERE day < v_moc;
    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    RETURN v_xoa + v_tmp;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ghi_telemetry_lenh(jsonb)        FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.telemetry_lenh_cua_so(integer)   FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.don_telemetry_lenh(integer)      FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ghi_telemetry_lenh(jsonb)        TO service_role;
GRANT  EXECUTE ON FUNCTION public.telemetry_lenh_cua_so(integer)   TO service_role;
GRANT  EXECUTE ON FUNCTION public.don_telemetry_lenh(integer)      TO service_role;

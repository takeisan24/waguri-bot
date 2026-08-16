-- ============================================================
-- 0117_ledger_source_attribution.sql — Cho sổ nhật ký phân biệt được NGUỒN tiền
--
-- VẤN ĐỀ (đo 2026-08-15): `economy_ledger` có 730/730 dòng đều mang nguồn
-- `increment_balance`. Lý do: `db.addMoney()` là helper DÙNG CHUNG — thưởng chat, thưởng
-- lệnh, admin cấp tiền đều đi qua nó, nên `ledger_source()` (vốn đoán nguồn bằng cách đọc
-- `current_query()`) chỉ thấy đúng một cái tên.
--
-- Hệ quả: KHÔNG chỉnh cân bằng kinh tế được, vì không biết tiền từ đâu ra. Đây là điều
-- kiện CẦN cho mọi quyết định cân bằng về sau — và làm được ngay cả khi chưa có người chơi.
--
-- CÁCH SỬA: `increment_balance` nhận thêm `p_source`, ghi vào biến phiên
-- `app.ledger_source` (phạm vi transaction), và `ledger_source()` đọc biến đó TRƯỚC khi
-- rơi về cách đoán cũ. Các RPC chuyên biệt (claim_daily, buy_item…) không cần đổi gì —
-- cách đoán cũ vẫn nhận đúng tên chúng.
--
-- VÌ SAO DROP RỒI TẠO LẠI thay vì thêm hàm chồng: `CREATE OR REPLACE` với số tham số khác
-- sẽ tạo hàm THỨ HAI cùng tên, dễ gây mập mờ khi PostgREST chọn hàm. Đã kiểm: không hàm
-- SQL nào gọi `increment_balance`, chỉ JS gọi qua PostgREST => thay chữ ký an toàn.
-- DROP + CREATE nằm CÙNG một transaction nên không có khoảng trống nào.
--
-- Idempotent.
-- ============================================================

DROP FUNCTION IF EXISTS public.increment_balance(text, text, bigint);

CREATE OR REPLACE FUNCTION public.increment_balance(
    p_user_id text,
    p_field   text,
    p_amount  bigint,
    p_source  text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
declare
    new_val bigint;
begin
    -- LUÔN đặt lại biến, kể cả khi không có nguồn (đặt về rỗng) — KHÔNG chỉ đặt khi có.
    -- Thử nghiệm trên waguri-test cho thấy nếu chỉ đặt-khi-có thì lời gọi thứ hai TRONG
    -- CÙNG transaction sẽ thừa hưởng nguồn của lời gọi trước và bị gán sai nhãn. PostgREST
    -- tách transaction mỗi request nên hiếm lộ ở prod, nhưng vẫn rò khi một hàm gọi hàm
    -- khác trong cùng transaction. Ghi đè vô điều kiện thì không còn cửa nào rò.
    -- `true` = phạm vi transaction hiện tại, tự hết khi transaction kết thúc.
    perform set_config('app.ledger_source', coalesce(left(nullif(p_source, ''), 40), ''), true);

    insert into users (user_id) values (p_user_id)
        on conflict (user_id) do nothing;

    if p_field = 'wallet' then
        update users set wallet = wallet + p_amount
            where user_id = p_user_id and wallet + p_amount >= 0
            returning wallet into new_val;
    elsif p_field = 'bank' then
        update users set bank = bank + p_amount
            where user_id = p_user_id and bank + p_amount >= 0
            returning bank into new_val;
    else
        raise exception 'Invalid balance field: %', p_field;
    end if;

    return new_val;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_balance(text, text, bigint, text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_balance(text, text, bigint, text) TO service_role;

-- ------------------------------------------------------------
-- ledger_source(): ưu tiên nguồn được khai báo TƯỜNG MINH, rồi mới đoán.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ledger_source()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE q TEXT; cand TEXT; v TEXT;
BEGIN
    -- 1) Nguồn do tầng gọi khai báo (chính xác tuyệt đối, không phải đoán).
    v := current_setting('app.ledger_source', true);
    IF v IS NOT NULL AND v <> '' THEN RETURN v; END IF;

    -- 2) Đoán từ câu truy vấn — vẫn đúng cho các RPC chuyên biệt (claim_daily, buy_item…).
    q := current_query();
    IF q IS NULL THEN RETURN NULL; END IF;
    FOR cand IN SELECT (regexp_matches(q, '"?public"?\."?([a-z_][a-z0-9_]{2,40})"?\s*\(', 'g'))[1] LOOP
        IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = cand) THEN RETURN cand; END IF;
    END LOOP;
    FOR cand IN SELECT (regexp_matches(q, '\y([a-z_][a-z0-9_]{2,40})\s*\(', 'g'))[1] LOOP
        IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = cand) THEN RETURN cand; END IF;
    END LOOP;
    RETURN 'unknown';
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END; $$;

-- ============================================================
-- VERIFY (trên waguri-test):
--   SELECT public.increment_balance('zz_src','wallet',100,'chat');
--   SELECT source, delta FROM economy_ledger WHERE user_id='zz_src' ORDER BY at DESC LIMIT 1;
--     -> source = 'chat'   (KHÔNG phải 'increment_balance')
--   SELECT public.increment_balance('zz_src','wallet',50);        -- không khai nguồn
--     -> source = 'increment_balance'  (rơi về cách đoán cũ)
-- ============================================================

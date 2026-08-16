-- ============================================================
-- 0119_antinuke.sql — Hạ tầng DB cho hệ Chống Nuke (P0)
--
-- BỐI CẢNH: xem `docs/spec-antinuke.md`. Waguri đang phục vụ nhiều server; một vụ nuke
-- (xoá sạch kênh/role, ban hàng loạt) mất chưa tới 30 giây và KHÔNG hoàn tác được phần
-- tin nhắn. Hệ này chặn ở tầng phát hiện + tước quyền tức thì.
--
-- NGUYÊN TẮC CHI PHỐI TOÀN BỘ THIẾT KẾ (spec §2.1): **đường nóng không được await
-- Supabase.** Khi đang bị nuke, mỗi 300 ms là một kênh nữa mất; repo này đã có tiền sử
-- Supabase chập chờn ăn hết 3 s và làm hỏng interaction (lý do `src/lib/i18n.js` phải
-- cache). Vì vậy DB ở đây chỉ giữ hai vai:
--    1. NGUỒN CẤU HÌNH nạp trước vào RAM (một RPC `antinuke_get` = 1 RTT, cache 60 s)
--    2. SỔ GHI SỰ CỐ ghi SAU khi đã ra tay (fire-and-forget)
-- Không có đường nào bắt bot phải đợi DB rồi mới được phòng thủ.
--
-- MẶC ĐỊNH NHÁT CÓ CHỦ Ý: `enabled=false`, `mode='dryrun'`. Bật lên chỉ ghi log chứ
-- chưa trừng phạt ai. Ban nhầm một admin thật đắt hơn nhiều so với chậm một ngày —
-- chuyển sang `enforce` phải là hành động có chủ đích của CHỦ SERVER.
--
-- Bảng snapshot/khôi phục (F2/F18) thuộc P1, sẽ ở migration riêng — không dựng sẵn
-- bề mặt chưa dùng.
--
-- Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1. BẢNG
-- ------------------------------------------------------------

-- Cấu hình theo server. CỐ Ý không nhét vào `guild_settings` (JSONB phẳng, mọi tính
-- năng dùng chung): anti-nuke cần cột `enabled`/`mode` truy vấn được và một đường ghi
-- riêng chỉ chủ server chạm tới, không lẫn với `/config` mà mọi Manage Guild đều gọi.
CREATE TABLE IF NOT EXISTS public.antinuke_settings (
    guild_id    text PRIMARY KEY,
    enabled     boolean     NOT NULL DEFAULT false,
    mode        text        NOT NULL DEFAULT 'dryrun',   -- 'dryrun' | 'enforce'
    config      jsonb       NOT NULL DEFAULT '{}'::jsonb, -- ngưỡng/hình phạt ghi đè, kênh log
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text
);

-- Whitelist: ai được miễn trừ. `kind` = 'user' | 'role'.
CREATE TABLE IF NOT EXISTS public.antinuke_whitelist (
    guild_id   text        NOT NULL,
    entity_id  text        NOT NULL,
    kind       text        NOT NULL DEFAULT 'user',
    added_by   text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (guild_id, entity_id)
);

-- Sổ sự cố. Ghi cả lượt `dryrun` (verdict='log') — đó chính là dữ liệu để chủ server
-- xem 7 ngày rồi mới dám bật `enforce`.
CREATE TABLE IF NOT EXISTS public.antinuke_incidents (
    id          bigserial PRIMARY KEY,
    guild_id    text        NOT NULL,
    executor_id text,
    action_type text        NOT NULL,
    hit_count   int         NOT NULL DEFAULT 0,
    window_ms   int         NOT NULL DEFAULT 0,
    mode        text        NOT NULL DEFAULT 'dryrun',
    verdict     text        NOT NULL,                    -- 'log'|'strip'|'kick'|'ban'
    punished    boolean     NOT NULL DEFAULT false,      -- hình phạt có THỰC SỰ thành công không
    detail      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_antinuke_incidents_guild
    ON public.antinuke_incidents (guild_id, created_at DESC);

-- Từng thao tác trong một sự cố. Đây là thứ cho phép P1 làm `unban-wave` (gỡ đúng
-- những người mà KẺ ĐÓ ban, không đụng ban hợp lệ trước đó) và nút Hoàn tác.
CREATE TABLE IF NOT EXISTS public.antinuke_actions (
    id          bigserial PRIMARY KEY,
    incident_id bigint      NOT NULL REFERENCES public.antinuke_incidents(id) ON DELETE CASCADE,
    kind        text        NOT NULL,   -- 'ban'|'kick'|'strip'|'revert_role'|'delete_channel'|'delete_webhook'|'lockdown'
    target_id   text,
    payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_antinuke_actions_incident
    ON public.antinuke_actions (incident_id, kind);

-- Event trigger `ensure_rls` (migration 0112) đã tự bật RLS cho bảng mới, nhưng viết
-- tường minh để bản dựng lại từ đầu không phụ thuộc thứ tự event trigger.
ALTER TABLE public.antinuke_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.antinuke_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.antinuke_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.antinuke_actions   ENABLE ROW LEVEL SECURITY;

-- Không bảng nào ở đây được lộ ra ngoài service_role: whitelist + sổ sự cố là bản đồ
-- phòng thủ của server, đọc được là biết chỗ hở.
REVOKE ALL ON TABLE public.antinuke_settings  FROM anon, authenticated;
REVOKE ALL ON TABLE public.antinuke_whitelist FROM anon, authenticated;
REVOKE ALL ON TABLE public.antinuke_incidents FROM anon, authenticated;
REVOKE ALL ON TABLE public.antinuke_actions   FROM anon, authenticated;
GRANT ALL ON TABLE public.antinuke_settings  TO service_role;
GRANT ALL ON TABLE public.antinuke_whitelist TO service_role;
GRANT ALL ON TABLE public.antinuke_incidents TO service_role;
GRANT ALL ON TABLE public.antinuke_actions   TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.antinuke_incidents_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.antinuke_actions_id_seq   TO service_role;

-- ------------------------------------------------------------
-- 2. RPC
-- ------------------------------------------------------------

-- Cấu hình + whitelist trong MỘT lượt đi về. Bot gọi hàm này lúc `ready` và mỗi 60 s
-- để làm ấm cache; hai lượt RTT nối tiếp là thứ đã từng làm hỏng đường ack lệnh.
CREATE OR REPLACE FUNCTION public.antinuke_get(p_guild text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT jsonb_build_object(
        'guild_id',  p_guild,
        'enabled',   COALESCE((SELECT s.enabled FROM public.antinuke_settings s WHERE s.guild_id = p_guild), false),
        'mode',      COALESCE((SELECT s.mode    FROM public.antinuke_settings s WHERE s.guild_id = p_guild), 'dryrun'),
        'config',    COALESCE((SELECT s.config  FROM public.antinuke_settings s WHERE s.guild_id = p_guild), '{}'::jsonb),
        'whitelist', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', w.entity_id, 'kind', w.kind))
                                 FROM public.antinuke_whitelist w WHERE w.guild_id = p_guild), '[]'::jsonb)
    );
$$;

-- Đặt CỜ chính: `enabled` hoặc `mode`.
--
-- CỐ Ý TÁCH LÀM HAI HÀM (cờ / khoá config). Bản đầu gộp chung một hàm `antinuke_set`
-- nhận mọi p_field, và hệ quả là mọi nơi ghi config — kể cả `lockdown.js` chỉ lưu
-- trạng thái khoá — đều phải biết tới nhánh lỗi `mode_invalid` vốn không liên quan gì
-- tới nó. Một hàm, hai trách nhiệm, thì mọi caller gánh tập status của cả hai.
--
-- Status trả về là DUY NHẤT một chuỗi (không dùng cặp status='error' + reason=...):
-- tầng lệnh phân nhánh theo `status`, nên nhét lý do vào field khác chỉ tạo ra nhánh
-- chết ở phía JS mà không ai phát hiện.
CREATE OR REPLACE FUNCTION public.antinuke_set_flag(
    p_guild text,
    p_field text,
    p_value text,
    p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Chèn dòng gốc trước để nhánh nào cũng có hàng mà cập nhật (idempotent).
    INSERT INTO public.antinuke_settings (guild_id) VALUES (p_guild)
    ON CONFLICT (guild_id) DO NOTHING;

    IF p_field = 'enabled' THEN
        UPDATE public.antinuke_settings
           SET enabled = (p_value IN ('1','true','t','TRUE')),
               updated_at = now(), updated_by = p_actor
         WHERE guild_id = p_guild;

    ELSIF p_field = 'mode' THEN
        IF p_value NOT IN ('dryrun','enforce') THEN
            RETURN jsonb_build_object('status','mode_invalid');
        END IF;
        UPDATE public.antinuke_settings
           SET mode = p_value, updated_at = now(), updated_by = p_actor
         WHERE guild_id = p_guild;

    ELSE
        RETURN jsonb_build_object('status','field_invalid');
    END IF;

    RETURN jsonb_build_object('status','ok');
END;
$$;

-- Đặt/xoá một khoá trong `config` (log_channel, disable_at, lockdown_state...).
-- Chỉ có một kết quả: 'ok'. Không nhánh lỗi nào để caller phải gánh.
CREATE OR REPLACE FUNCTION public.antinuke_set_config(
    p_guild text,
    p_key text,
    p_value text,
    p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    INSERT INTO public.antinuke_settings (guild_id) VALUES (p_guild)
    ON CONFLICT (guild_id) DO NOTHING;

    -- Chuỗi rỗng = XOÁ khoá, để `/antinuke logchannel` bỏ trống gỡ được cấu hình
    -- thay vì lưu chuỗi rỗng rồi mọi chỗ đọc phải tự đoán.
    UPDATE public.antinuke_settings
       SET config = CASE WHEN p_value IS NULL OR p_value = ''
                         THEN config - p_key
                         ELSE config || jsonb_build_object(p_key, p_value) END,
           updated_at = now(), updated_by = p_actor
     WHERE guild_id = p_guild;

    RETURN jsonb_build_object('status','ok');
END;
$$;

CREATE OR REPLACE FUNCTION public.antinuke_whitelist_add(
    p_guild text,
    p_entity text,
    p_kind text DEFAULT 'user',
    p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_count int;
BEGIN
    IF p_kind NOT IN ('user','role') THEN
        RETURN jsonb_build_object('status','kind_invalid');
    END IF;

    -- Trần 50: whitelist là DANH SÁCH MIỄN TRỪ — nó càng dài thì hệ càng vô dụng.
    -- Server nào cần hơn 50 người miễn trừ thì vấn đề nằm ở phân quyền, không phải ở đây.
    SELECT count(*) INTO v_count FROM public.antinuke_whitelist WHERE guild_id = p_guild;
    IF v_count >= 50 THEN
        RETURN jsonb_build_object('status','whitelist_full');
    END IF;

    INSERT INTO public.antinuke_whitelist (guild_id, entity_id, kind, added_by)
    VALUES (p_guild, p_entity, p_kind, p_actor)
    ON CONFLICT (guild_id, entity_id) DO UPDATE SET kind = EXCLUDED.kind;

    RETURN jsonb_build_object('status','ok');
END;
$$;

CREATE OR REPLACE FUNCTION public.antinuke_whitelist_remove(p_guild text, p_entity text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_deleted int;
BEGIN
    DELETE FROM public.antinuke_whitelist WHERE guild_id = p_guild AND entity_id = p_entity;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN jsonb_build_object('status', CASE WHEN v_deleted > 0 THEN 'ok' ELSE 'not_found' END);
END;
$$;

-- Mở một sự cố, trả `id` để các thao tác con gắn vào.
CREATE OR REPLACE FUNCTION public.antinuke_incident_open(
    p_guild text,
    p_executor text,
    p_action text,
    p_hits int,
    p_window int,
    p_mode text,
    p_verdict text,
    p_punished boolean,
    p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_id bigint;
BEGIN
    INSERT INTO public.antinuke_incidents
        (guild_id, executor_id, action_type, hit_count, window_ms, mode, verdict, punished, detail)
    VALUES
        (p_guild, p_executor, p_action, COALESCE(p_hits,0), COALESCE(p_window,0),
         COALESCE(p_mode,'dryrun'), p_verdict, COALESCE(p_punished,false), COALESCE(p_detail,'{}'::jsonb))
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.antinuke_action_log(
    p_incident bigint,
    p_kind text,
    p_target text DEFAULT NULL,
    p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    INSERT INTO public.antinuke_actions (incident_id, kind, target_id, payload)
    VALUES (p_incident, p_kind, p_target, COALESCE(p_payload,'{}'::jsonb));
    RETURN jsonb_build_object('status','ok');
END;
$$;

CREATE OR REPLACE FUNCTION public.antinuke_incidents_recent(p_guild text, p_limit int DEFAULT 10)
RETURNS SETOF public.antinuke_incidents
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT * FROM public.antinuke_incidents
     WHERE guild_id = p_guild
     ORDER BY created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit,10), 1), 25);
$$;

-- Dọn sổ sự cố cũ. Giữ 90 ngày là đủ để điều tra một vụ nuke mà không phình free-tier.
CREATE OR REPLACE FUNCTION public.antinuke_prune_incidents(p_days int DEFAULT 90)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_deleted int;
BEGIN
    DELETE FROM public.antinuke_incidents
     WHERE created_at < now() - make_interval(days => GREATEST(COALESCE(p_days,90), 7));
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;   -- antinuke_actions tự xoá theo ON DELETE CASCADE
END;
$$;

-- ------------------------------------------------------------
-- 3. PHÂN QUYỀN — chỉ service_role (bot). Không có đường nào từ web/anon.
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.antinuke_get(text)                                        FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.antinuke_set_flag(text, text, text, text)                 FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.antinuke_set_config(text, text, text, text)               FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.antinuke_whitelist_add(text, text, text, text)            FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.antinuke_whitelist_remove(text, text)                     FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.antinuke_incident_open(text, text, text, int, int, text, text, boolean, jsonb) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.antinuke_action_log(bigint, text, text, jsonb)            FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.antinuke_incidents_recent(text, int)                      FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.antinuke_prune_incidents(int)                             FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.antinuke_get(text)                                         TO service_role;
GRANT EXECUTE ON FUNCTION public.antinuke_set_flag(text, text, text, text)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.antinuke_set_config(text, text, text, text)                TO service_role;
GRANT EXECUTE ON FUNCTION public.antinuke_whitelist_add(text, text, text, text)             TO service_role;
GRANT EXECUTE ON FUNCTION public.antinuke_whitelist_remove(text, text)                      TO service_role;
GRANT EXECUTE ON FUNCTION public.antinuke_incident_open(text, text, text, int, int, text, text, boolean, jsonb)  TO service_role;
GRANT EXECUTE ON FUNCTION public.antinuke_action_log(bigint, text, text, jsonb)             TO service_role;
GRANT EXECUTE ON FUNCTION public.antinuke_incidents_recent(text, int)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.antinuke_prune_incidents(int)                              TO service_role;

-- ============================================================
-- VERIFY (chạy trên waguri-test trước khi áp prod):
--   SELECT public.antinuke_get('zz_guild');
--     -> {"enabled": false, "mode": "dryrun", "config": {}, "whitelist": []}   (mặc định NHÁT)
--   SELECT public.antinuke_set_flag('zz_guild','enabled','1','zz_owner');
--   SELECT public.antinuke_set_flag('zz_guild','mode','enforce','zz_owner');
--   SELECT public.antinuke_set_config('zz_guild','log_channel','123','zz_owner');
--   SELECT public.antinuke_set_flag('zz_guild','mode','xyz','zz_owner');    -> status=mode_invalid
--   SELECT public.antinuke_set_flag('zz_guild','linh_tinh','1','zz_owner'); -> status=field_invalid
--   SELECT public.antinuke_whitelist_add('zz_guild','zz_user','user','zz_owner');
--   SELECT public.antinuke_whitelist_add('zz_guild','zz_x','sai_kieu','zz_owner'); -> status=kind_invalid
--   SELECT public.antinuke_get('zz_guild');
--     -> enabled=true, mode=enforce, config={"log_channel":"123"}, whitelist=[{id:zz_user,kind:user}]
--   SELECT public.antinuke_set_config('zz_guild','log_channel','','zz_owner');
--   SELECT public.antinuke_get('zz_guild');   -> config = {}   (chuỗi rỗng = xoá khoá)
--   SELECT public.antinuke_incident_open('zz_guild','zz_bad','channel_delete',3,20000,'enforce','ban',true,'{}');
--     -> trả id, ghi nhớ để dòng dưới
--   SELECT public.antinuke_action_log(<id>,'ban','zz_bad','{}');
--   SELECT * FROM public.antinuke_incidents_recent('zz_guild', 5);
--   -- DỌN:
--   DELETE FROM public.antinuke_incidents WHERE guild_id='zz_guild';   -- actions xoá theo cascade
--   DELETE FROM public.antinuke_whitelist WHERE guild_id='zz_guild';
--   DELETE FROM public.antinuke_settings  WHERE guild_id='zz_guild';
-- ============================================================

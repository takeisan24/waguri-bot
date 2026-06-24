-- ============================================================
-- 0059_game_stakes.sql — Ghi cược game đa người vào DB để hoàn khi bot restart (M3)
-- ------------------------------------------------------------
-- Trước đây loto/bingo/masoi trừ tiền rồi giữ ván trong RAM -> bot restart giữa ván
-- = mất sạch cược, không hoàn. Nay: mỗi lần thu cược ghi 1 dòng (kèm session_id).
--   - Ván kết thúc bình thường (cược -> pot -> trả thưởng): stake_settle() xoá dòng.
--   - Ván huỷ/hoà/lỗi: stake_refund_session() hoàn + xoá.
--   - Bot khởi động: stake_refund_orphans() hoàn MỌI dòng còn sót (ván chết do restart) + xoá.
-- ============================================================

create table if not exists game_stakes (
    id          bigserial primary key,
    session_id  uuid not null,
    game        text not null,
    channel_id  text,
    user_id     text not null,
    amount      bigint not null,
    created_at  timestamptz not null default now()
);
create index if not exists idx_game_stakes_session on game_stakes(session_id);

-- Thu cược NGUYÊN TỬ: trừ ví (guard) + ghi dòng cược. Trả true nếu đủ tiền.
create or replace function stake_collect(p_session uuid, p_game text, p_channel text, p_user text, p_amount bigint)
returns boolean language plpgsql
set search_path = pg_catalog, public
as $$
declare v_upd int;
begin
    if p_amount <= 0 then return false; end if;
    insert into users(user_id) values (p_user) on conflict (user_id) do nothing;
    update users set wallet = wallet - p_amount where user_id = p_user and wallet >= p_amount;
    get diagnostics v_upd = row_count;
    if v_upd = 0 then return false; end if;
    insert into game_stakes(session_id, game, channel_id, user_id, amount)
        values (p_session, p_game, p_channel, p_user, p_amount);
    return true;
end; $$;

-- Ván xong bình thường: cược đã thành pot & trả thưởng -> chỉ xoá dòng (không hoàn).
create or replace function stake_settle(p_session uuid)
returns void language plpgsql
set search_path = pg_catalog, public
as $$
begin
    delete from game_stakes where session_id = p_session;
end; $$;

-- Huỷ ván: hoàn cược cho từng người rồi xoá. Trả tổng tiền đã hoàn.
create or replace function stake_refund_session(p_session uuid)
returns bigint language plpgsql
set search_path = pg_catalog, public
as $$
declare v_total bigint := 0; r record;
begin
    for r in select user_id, amount from game_stakes where session_id = p_session loop
        update users set wallet = wallet + r.amount where user_id = r.user_id;
        v_total := v_total + r.amount;
    end loop;
    delete from game_stakes where session_id = p_session;
    return v_total;
end; $$;

-- Khởi động bot: hoàn MỌI dòng còn sót (ván chết do restart) rồi xoá sạch.
create or replace function stake_refund_orphans()
returns jsonb language plpgsql
set search_path = pg_catalog, public
as $$
declare v_total bigint := 0; v_count int := 0; r record;
begin
    for r in select user_id, amount from game_stakes loop
        update users set wallet = wallet + r.amount where user_id = r.user_id;
        v_total := v_total + r.amount;
        v_count := v_count + 1;
    end loop;
    delete from game_stakes;
    return jsonb_build_object('count', v_count, 'total', v_total);
end; $$;

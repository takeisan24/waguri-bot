-- ============================================================
-- 0002_functions.sql — RPC NGUYÊN TỬ (atomic)
-- Đây là phần QUAN TRỌNG NHẤT: mọi thay đổi tiền/exp/cooldown
-- phải xảy ra TRONG database trong 1 câu lệnh, tránh race condition
-- (dupe tiền, claim cooldown đúp) khi nhiều interaction chạy song song.
-- An toàn chạy lại nhiều lần nhờ "create or replace".
-- ============================================================

-- ------------------------------------------------------------
-- increment_balance: cộng/trừ tiền nguyên tử, chặn âm.
-- Trả về số dư mới (bigint). Trả NULL nếu KHÔNG đủ tiền (guard âm).
-- ------------------------------------------------------------
create or replace function increment_balance(
    p_user_id text,
    p_field   text,
    p_amount  bigint
)
returns bigint
language plpgsql
as $$
declare
    new_val bigint;
begin
    -- Đảm bảo user tồn tại (atomic upsert)
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

    -- new_val NULL => câu update không match (số dư không đủ)
    return new_val;
end;
$$;

-- ------------------------------------------------------------
-- transfer_money: chuyển tiền giữa 2 user trong 1 transaction.
-- Trả TRUE nếu thành công, FALSE nếu thiếu tiền / input sai.
-- ------------------------------------------------------------
create or replace function transfer_money(
    p_from   text,
    p_to     text,
    p_amount bigint
)
returns boolean
language plpgsql
as $$
declare
    affected int;
begin
    if p_amount <= 0 or p_from = p_to then
        return false;
    end if;

    insert into users (user_id) values (p_from) on conflict (user_id) do nothing;
    insert into users (user_id) values (p_to)   on conflict (user_id) do nothing;

    update users set wallet = wallet - p_amount
        where user_id = p_from and wallet >= p_amount;
    get diagnostics affected = row_count;
    if affected = 0 then
        return false;  -- không đủ tiền
    end if;

    update users set wallet = wallet + p_amount where user_id = p_to;
    return true;
end;
$$;

-- ------------------------------------------------------------
-- add_exp: cộng EXP nguyên tử, trả về EXP mới (để tính level).
-- ------------------------------------------------------------
create or replace function add_exp(
    p_user_id text,
    p_amount  bigint
)
returns bigint
language plpgsql
as $$
declare
    new_exp bigint;
begin
    insert into users (user_id) values (p_user_id)
        on conflict (user_id) do nothing;

    update users set exp = exp + p_amount
        where user_id = p_user_id
        returning exp into new_exp;

    return new_exp;
end;
$$;

-- ------------------------------------------------------------
-- claim_cooldown: KIỂM TRA + ĐẶT cooldown trong 1 thao tác nguyên tử.
--   Trả NULL  => claim thành công (được phép thực thi lệnh ngay).
--   Trả timestamptz => đang bị cooldown, hết hạn vào thời điểm đó.
-- Race-safe nhờ "on conflict ... do update WHERE expires_at <= now()".
-- ------------------------------------------------------------
create or replace function claim_cooldown(
    p_user_id          text,
    p_command          text,
    p_duration_seconds int
)
returns timestamptz
language plpgsql
as $$
declare
    claimed   timestamptz;
    existing  timestamptz;
begin
    insert into cooldowns (user_id, command, expires_at)
    values (p_user_id, p_command, now() + make_interval(secs => p_duration_seconds))
    on conflict (user_id, command) do update
        set expires_at = excluded.expires_at
        where cooldowns.expires_at <= now()   -- chỉ ghi đè khi cooldown CŨ đã hết
    returning expires_at into claimed;

    if claimed is not null then
        return null;  -- claim được => cho phép chạy
    end if;

    -- Không claim được => đang còn cooldown, lấy thời điểm hết hạn để báo user
    select expires_at into existing
        from cooldowns where user_id = p_user_id and command = p_command;
    return existing;
end;
$$;

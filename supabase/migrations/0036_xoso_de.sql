-- ============================================================
-- 0036_xoso_de.sql — Đánh đề theo XSMB (dò giải đặc biệt 18h30)
-- xoso_bets: cược 2 số; xoso_results: kết quả mỗi ngày.
-- ============================================================
create table if not exists xoso_bets (
    id         bigserial primary key,
    user_id    text not null,
    number     int not null,
    amount     bigint not null,
    draw_date  date not null,
    status     text not null default 'pending',
    created_at timestamptz not null default now()
);
create index if not exists idx_xoso_bets_draw on xoso_bets(draw_date, status);

create table if not exists xoso_results (
    draw_date  date primary key,
    number     int not null,
    created_at timestamptz not null default now()
);

create or replace function xoso_bet(p_user text, p_number int, p_amount bigint, p_date date)
returns jsonb language plpgsql as $$
declare v_upd int;
begin
    insert into users(user_id) values(p_user) on conflict(user_id) do nothing;
    update users set wallet = wallet - p_amount where user_id = p_user and wallet >= p_amount;
    get diagnostics v_upd = row_count;
    if v_upd = 0 then return jsonb_build_object('status','poor'); end if;
    insert into xoso_bets(user_id, number, amount, draw_date) values (p_user, p_number, p_amount, p_date);
    return jsonb_build_object('status','ok');
end; $$;

create or replace function xoso_resolve(p_date date, p_number int, p_mult int)
returns jsonb language plpgsql as $$
declare v_total int; v_winners int; v_paid bigint; rec record;
begin
    if exists (select 1 from xoso_results where draw_date = p_date) then
        return jsonb_build_object('status','already');
    end if;
    select count(*) into v_total from xoso_bets where draw_date = p_date and status = 'pending';
    v_winners := 0; v_paid := 0;
    for rec in select user_id, amount from xoso_bets where draw_date = p_date and status = 'pending' and number = p_number loop
        update users set wallet = wallet + rec.amount * p_mult where user_id = rec.user_id;
        v_winners := v_winners + 1;
        v_paid := v_paid + rec.amount * p_mult;
    end loop;
    update xoso_bets set status = 'resolved' where draw_date = p_date and status = 'pending';
    insert into xoso_results(draw_date, number) values (p_date, p_number);
    return jsonb_build_object('status','ok','total', v_total, 'winners', v_winners, 'paid', v_paid, 'number', p_number);
end; $$;

-- ============================================================
-- 0142_pet_rarity_ascend_hatch.sql — Bậc độ hiếm cho thú cưng.
--
-- Spec: docs/spec-pet-rarity.md. Số nền đo trên prod ngày 24/08/2026:
--   · 2/395 người có pet (0,51%); 0 pet chạm Lv.5 -> cả 6 buff loài CHƯA CHẠY LẦN NÀO
--   · chi phí lên Lv.30 cũ ~1.835.700 xu = 3,1× toàn bộ cung tiền (583.809 xu)
--   · nhịp cày /fish+/mine+/chop = 36 lượt / 7 người trong cả đời sổ cái
-- Nên bản này vừa mở bậc mới, vừa hạ ngưỡng để bậc CÓ THẬT chứ không phải chữ chết.
--
-- Ba việc:
--   A. cột `ascended_to` + 3 vật phẩm Trứng
--   B. `ascend_pet`     — thăng ĐÚNG MỘT bậc, nguyên tử, lễ vật lấy từ 3 bộ sưu tập sẵn có
--   C. `hatch_pet_egg`  — ấp trứng: đổi loài + bậc, GIỮ NGUYÊN exp/kỹ năng/tên
--
-- ALLOW-LIST NẰM TRONG DB, không chỉ ở `choices` của slash command. Bài học 0109:
-- whitelist chỉ ở tầng lệnh thì bất kỳ đường gọi mới nào quên kiểm là lại hở.
-- `adoptPet` (src/database.js) tới giờ vẫn insert thẳng species không kiểm — 0142 đóng nốt.
--
-- Idempotent.
-- ============================================================

-- ── A1. Cột bậc đã làm lễ ─────────────────────────────────────────────────────
-- CHỈ lưu bậc đã LÀM LỄ. Bậc hiệu lực được SUY RA (max của: bậc theo cấp, bậc gốc
-- của loài, và cột này) — không lưu bậc hiệu lực để khỏi trôi số khi đổi cân bằng.
alter table public.user_pets add column if not exists ascended_to text;

-- ── A2. Ba loại Trứng ─────────────────────────────────────────────────────────
-- GIÁ = 0 CÓ CHỦ Ý. Giá chợ suy ra từ `items.price × 0.5 × mult`, nên trứng có giá
-- cao + rơi tự do khi cày = máy in tiền. Trứng để ấp, không để bán.
insert into public.items (id, name, description, price, type, category, rarity, shop_hidden) values
    ('trung_su_thi',      'Trứng Sử Thi',      'Quả trứng ấm nóng nhặt được khi cày cuốc. Dùng `/pet hatch` để đánh thức một loài Sử Thi.',      0, 'misc', 'pet', 'epic',      true),
    ('trung_huyen_thoai', 'Trứng Huyền Thoại', 'Vỏ trứng ánh lên hoa văn trống đồng. Dùng `/pet hatch` để đánh thức một loài Huyền Thoại.',      0, 'misc', 'pet', 'legendary', true),
    ('trung_than_thoai',  'Trứng Thần Thoại',  'Trứng của loài chỉ còn trong truyền thuyết. Dùng `/pet hatch` để đánh thức một loài Thần Thoại.', 0, 'misc', 'pet', 'mythic',    true)
on conflict (id) do update set
    name = excluded.name, description = excluded.description, price = excluded.price,
    type = excluded.type, category = excluded.category, rarity = excluded.rarity,
    shop_hidden = excluded.shop_hidden;

-- ── Hàm nền ───────────────────────────────────────────────────────────────────
-- Khớp src/data/pets.js. Hai tầng cố tình khai TRÙNG NHAU: JS để hiển thị, SQL để
-- CƯỠNG CHẾ. Sửa một bên mà quên bên kia thì khối VERIFY cuối tệp sẽ báo.

create or replace function public.pet_level(p_exp int)
returns int language sql immutable
set search_path = pg_catalog, public
as $$ select floor(sqrt(greatest(0, coalesce(p_exp, 0)) / 30.0))::int + 1; $$;

create or replace function public.pet_rarity_rank(p_key text)
returns int language sql immutable
set search_path = pg_catalog, public
as $$ select case p_key
    when 'common' then 0 when 'rare' then 1 when 'epic' then 2
    when 'legendary' then 3 when 'mythic' then 4 else -1 end; $$;

create or replace function public.pet_rarity_min_level(p_key text)
returns int language sql immutable
set search_path = pg_catalog, public
as $$ select case p_key
    when 'common' then 1 when 'rare' then 5 when 'epic' then 10
    when 'legendary' then 15 when 'mythic' then 20 else null end; $$;

-- Bậc KHỞI ĐIỂM của loài. NULL = loài không tồn tại -> đây chính là allow-list.
create or replace function public.pet_species_base_rarity(p_species text)
returns text language sql immutable
set search_path = pg_catalog, public
as $$ select case p_species
    when 'meo' then 'common' when 'cun' then 'common' when 'rong' then 'common'
    when 'cao' then 'common' when 'tho' then 'common' when 'gau' then 'common'
    when 'ho' then 'epic'       when 'nghe' then 'epic'
    when 'chim_lac' then 'legendary' when 'giao_long' then 'legendary'
    when 'kim_quy' then 'mythic'     when 'phuong_hoang' then 'mythic'
    else null end; $$;

-- Loài nào nhận nuôi miễn phí được. Loài bậc cao chỉ nở từ trứng.
create or replace function public.pet_species_adoptable(p_species text)
returns boolean language sql immutable
set search_path = pg_catalog, public
as $$ select p_species in ('meo', 'cun', 'rong', 'cao', 'tho', 'gau'); $$;

-- Bậc hiệu lực = max(bậc theo cấp [trần 'rare'], bậc gốc loài, bậc đã làm lễ).
create or replace function public.pet_effective_rarity(p_species text, p_exp int, p_ascended text)
returns text language plpgsql immutable
set search_path = pg_catalog, public
as $$
declare
    v_lvl  int := public.pet_level(p_exp);
    v_best text := 'common';
    v_base text := public.pet_species_base_rarity(p_species);
begin
    -- Chỉ 'common' và 'rare' lên được bằng cấp; từ 'epic' bắt buộc làm lễ.
    if v_lvl >= public.pet_rarity_min_level('rare') then v_best := 'rare'; end if;
    if v_base is not null and public.pet_rarity_rank(v_base) > public.pet_rarity_rank(v_best) then
        v_best := v_base;
    end if;
    if p_ascended is not null and public.pet_rarity_rank(p_ascended) > public.pet_rarity_rank(v_best) then
        v_best := p_ascended;
    end if;
    return v_best;
end; $$;

-- ── B. ascend_pet — thăng đúng MỘT bậc ────────────────────────────────────────
-- Lễ vật lấy từ đúng 5 món đã nằm trong collections.js (Ngư Ông / Lâm Khoáng / Bàn
-- Tay Vàng), nên muốn thăng bậc là phải chạm vào câu cá, đào mỏ và bàn chế tạo.
create or replace function public.ascend_pet(p_user text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
    v_species  text;
    v_exp      int;
    v_asc      text;
    v_cur      text;
    v_next     text;
    v_lvl      int;
    v_min      int;
    v_sets     text[][];
    v_set      text[];
    v_chosen   text[] := null;
    v_it       text;
    v_have     int;
    v_ok       boolean;
    v_rows     int;
begin
    select species, exp, ascended_to into v_species, v_exp, v_asc
      from public.user_pets where user_id = p_user for update;
    if not found then
        return jsonb_build_object('status', 'no_pet');
    end if;

    v_cur  := public.pet_effective_rarity(v_species, v_exp, v_asc);
    v_next := case v_cur when 'common' then 'rare' when 'rare' then 'epic'
                         when 'epic' then 'legendary' when 'legendary' then 'mythic' else null end;
    if v_next is null then
        return jsonb_build_object('status', 'max_rarity', 'rarity', v_cur);
    end if;

    v_lvl := public.pet_level(v_exp);
    v_min := public.pet_rarity_min_level(v_next);
    if v_lvl < v_min then
        return jsonb_build_object('status', 'low_level', 'rarity', v_cur, 'next', v_next,
                                  'level', v_lvl, 'need_level', v_min);
    end if;

    -- Lễ vật theo bậc đích. Mỗi phần tử là MỘT bộ thay thế nhau (OR).
    if v_next = 'rare' then
        v_sets := null;                                   -- lên Hiếm không cần lễ
    elsif v_next = 'epic' then
        v_sets := array[array['ca_rong_vang'], array['vang_dong_tren']];
    elsif v_next = 'legendary' then
        v_sets := array[array['ca_koi_nhat', 'ky_nam']];
    else
        v_sets := array[array['vuong_mieng_gold', 'ca_koi_nhat', 'ky_nam']];
    end if;

    if v_sets is not null then
        -- Chọn bộ ĐẦU TIÊN mà người chơi có đủ.
        for i in 1 .. array_length(v_sets, 1) loop
            v_set := v_sets[i:i][:];
            v_ok := true;
            foreach v_it in array v_set loop
                if v_it is null then continue; end if;
                select coalesce(quantity, 0) into v_have
                  from public.inventory where user_id = p_user and item_id = v_it for update;
                if coalesce(v_have, 0) < 1 then v_ok := false; exit; end if;
            end loop;
            if v_ok then v_chosen := v_set; exit; end if;
        end loop;

        if v_chosen is null then
            return jsonb_build_object('status', 'missing_items', 'rarity', v_cur,
                                      'next', v_next, 'need', to_jsonb(v_sets));
        end if;

        -- Trừ lễ vật. Guard `quantity >= 1` để dù lọt qua kiểm tra trên cũng không âm kho.
        foreach v_it in array v_chosen loop
            if v_it is null then continue; end if;
            update public.inventory set quantity = quantity - 1
             where user_id = p_user and item_id = v_it and quantity >= 1;
            get diagnostics v_rows = row_count;
            if v_rows <> 1 then
                raise exception '[0142] Tru le vat that bai: % (user %)', v_it, p_user;
            end if;
        end loop;
        delete from public.inventory where user_id = p_user and quantity <= 0;
    end if;

    update public.user_pets set ascended_to = v_next where user_id = p_user;

    return jsonb_build_object('status', 'ok', 'from', v_cur, 'rarity', v_next,
                              'spent', coalesce(to_jsonb(v_chosen), '[]'::jsonb));
end; $$;

-- ── C. hatch_pet_egg — ấp trứng ───────────────────────────────────────────────
-- GIỮ NGUYÊN exp / kỹ năng / điểm kỹ năng / tên: trứng ĐÁNH THỨC thú cưng đang nuôi
-- thành loài mới, không xoá công sức đã bỏ ra. Chưa có pet thì tạo mới ở exp 0.
create or replace function public.hatch_pet_egg(p_user text, p_egg text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
    v_rarity  text;
    v_have    int;
    v_species text;
    v_rows    int;
begin
    v_rarity := case p_egg
        when 'trung_su_thi'      then 'epic'
        when 'trung_huyen_thoai' then 'legendary'
        when 'trung_than_thoai'  then 'mythic'
        else null end;
    if v_rarity is null then
        return jsonb_build_object('status', 'bad_egg');
    end if;

    -- Khoá dòng kho TRƯỚC khi làm bất cứ việc gì: bấm đúp / web + bot cùng lúc
    -- không được phép nở hai lần bằng một quả trứng.
    select coalesce(quantity, 0) into v_have
      from public.inventory where user_id = p_user and item_id = p_egg for update;
    if coalesce(v_have, 0) < 1 then
        return jsonb_build_object('status', 'no_egg');
    end if;

    -- Bốc ngẫu nhiên một loài có bậc khởi điểm đúng bằng bậc của trứng.
    select s into v_species from unnest(array[
        'meo','cun','rong','cao','tho','gau','ho','nghe','chim_lac','giao_long','kim_quy','phuong_hoang'
    ]) as s
     where public.pet_species_base_rarity(s) = v_rarity
     order by random() limit 1;
    if v_species is null then
        return jsonb_build_object('status', 'no_species');
    end if;

    update public.inventory set quantity = quantity - 1
     where user_id = p_user and item_id = p_egg and quantity >= 1;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
        return jsonb_build_object('status', 'no_egg');
    end if;
    delete from public.inventory where user_id = p_user and quantity <= 0;

    insert into public.user_pets (user_id, species, name, exp, ascended_to)
         values (p_user, v_species, null, 0, v_rarity)
    on conflict (user_id) do update
        set species = excluded.species,
            -- Chỉ nâng, không hạ: ấp trứng Sử Thi không được kéo pet Thần Thoại xuống.
            ascended_to = case
                when public.pet_rarity_rank(coalesce(public.user_pets.ascended_to, 'common'))
                     > public.pet_rarity_rank(excluded.ascended_to)
                then public.user_pets.ascended_to else excluded.ascended_to end;

    return jsonb_build_object('status', 'ok', 'species', v_species, 'rarity', v_rarity);
end; $$;

-- ── D. adopt_pet — nhận nuôi có allow-list + chống đua ────────────────────────
-- Thay `if (await getPet()) return 'already'` rồi insert ở JS: hai lời gọi song song
-- cùng thấy "chưa có pet". Và JS chưa từng kiểm species.
create or replace function public.adopt_pet(p_user text, p_species text, p_name text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_rows int;
begin
    if public.pet_species_base_rarity(p_species) is null then
        return jsonb_build_object('status', 'bad_species');
    end if;
    if not public.pet_species_adoptable(p_species) then
        return jsonb_build_object('status', 'not_adoptable');
    end if;

    insert into public.user_pets (user_id, species, name, exp)
         values (p_user, p_species, nullif(p_name, ''), 0)
    on conflict (user_id) do nothing;

    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
        return jsonb_build_object('status', 'already');
    end if;
    return jsonb_build_object('status', 'ok', 'species', p_species);
end; $$;

-- ── Phân quyền ────────────────────────────────────────────────────────────────
-- Postgres tự cấp PUBLIC EXECUTE cho hàm mới -> phải REVOKE tay (bài học 0137/0138).
revoke execute on function public.ascend_pet(text)              from public, anon, authenticated;
revoke execute on function public.hatch_pet_egg(text, text)     from public, anon, authenticated;
revoke execute on function public.adopt_pet(text, text, text)   from public, anon, authenticated;
grant  execute on function public.ascend_pet(text)              to service_role;
grant  execute on function public.hatch_pet_egg(text, text)     to service_role;
grant  execute on function public.adopt_pet(text, text, text)   to service_role;

-- ============================================================
-- VERIFY — chạy ngay trong migration, sai là migration đổ.
-- ============================================================
do $$
declare
    v_t text;
    v_n int;
begin
    -- 1. Thang bậc phải đơn điệu tăng và khớp src/data/pets.js.
    if public.pet_rarity_rank('mythic') <> 4 or public.pet_rarity_rank('common') <> 0 then
        raise exception '[0142] Thang bac sai.';
    end if;
    if public.pet_rarity_rank('khong_ton_tai') <> -1 then
        raise exception '[0142] Bac la phai tra -1.';
    end if;

    -- 2. Công thức cấp phải khớp JS: floor(sqrt(exp/30))+1.
    if public.pet_level(0) <> 1 or public.pet_level(480) <> 5
       or public.pet_level(2430) <> 10 or public.pet_level(10830) <> 20 then
        raise exception '[0142] pet_level lech cong thuc JS.';
    end if;

    -- 3. Cấp KHÔNG được tự đưa pet lên quá 'rare' — từ 'epic' phải làm lễ.
    v_t := public.pet_effective_rarity('gau', 999999, null);
    if v_t <> 'rare' then
        raise exception '[0142] Cap tu day len % — tran auto hong.', v_t;
    end if;

    -- 4. Loài nở từ trứng phải có bậc khởi điểm đúng.
    if public.pet_effective_rarity('kim_quy', 0, null) <> 'mythic' then
        raise exception '[0142] Loai mythic khong khoi diem o mythic.';
    end if;

    -- 5. Loài lạ phải bị chặn (allow-list).
    if public.pet_species_base_rarity('khong_ton_tai') is not null then
        raise exception '[0142] Allow-list loai bi ho.';
    end if;

    -- 6. Mỗi bậc từ epic trở lên phải có ít nhất 1 loài để trứng nở ra.
    for v_t in select unnest(array['epic', 'legendary', 'mythic']) loop
        select count(*) into v_n from unnest(array[
            'meo','cun','rong','cao','tho','gau','ho','nghe','chim_lac','giao_long','kim_quy','phuong_hoang'
        ]) as s where public.pet_species_base_rarity(s) = v_t;
        if v_n < 1 then
            raise exception '[0142] Bac % khong co loai nao -> hatch se tra no_species.', v_t;
        end if;
    end loop;

    -- 7. Ba vật phẩm Trứng phải tồn tại và giá PHẢI bằng 0 (chống in tiền qua /sell).
    select count(*) into v_n from public.items
     where id in ('trung_su_thi', 'trung_huyen_thoai', 'trung_than_thoai') and price = 0;
    if v_n <> 3 then
        raise exception '[0142] Trung thieu hoac gia khac 0 (dem duoc %).', v_n;
    end if;

    raise notice '[0142] VERIFY: 7/7 dat.';
end $$;

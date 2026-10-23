-- ============================================================
-- 0159_so_confession_nguyen_tu.sql — Cấp số thứ tự confession bằng MỘT câu nguyên tử.
--
-- TRẠNG THÁI: ĐÃ ÁP 23/10/2026 lên test `nipdwmdwugipjmrmhagb` và prod
-- `kuvlkaxregnanhzgqrbp`, đã nghiệm thu (xem khối cuối file).
--
-- VÌ SAO CÓ. `nextConfessionNumber` (database.js) đọc-tính-trong-JS-rồi-ghi-đè, tức vi phạm
-- thẳng Luật 1 của AGENTS.md. Năm dòng đó chứa BA lỗi khác nhau, không phải một:
--
--     const s = await getGuildSettings(guildId);              -- (A) và (B)
--     const n = Number(s.confession_count || 0) + 1;
--     await setGuildSetting(guildId, 'confession_count', n);  -- (C)
--     return n;
--
--   (A) ĐUA TRANH. Hai confession cùng lúc đều đọc cùng một giá trị rồi đều ghi n+1 → hai
--       bài mang CÙNG một số. Đây là lỗi vẫn được nêu trong sổ, và là lỗi nhẹ nhất trong ba.
--   (B) ĐỌC HỤT LÀM MẤT CẢ DÃY SỐ — nặng nhất, và trước đây chưa ai nêu. `getGuildSettings`
--       trả `{}` khi lỗi (nuốt lỗi, xem database.js), nên `s.confession_count` thành
--       `undefined` → `n = 1`. Bài được đăng với số **#1** *và* counter bị ghi đè về 1. Một
--       lần DB chập là server mất toàn bộ lịch sử đánh số, rồi mọi bài sau đó trùng số với
--       bài cũ. Lỗi này không cần đua tranh gì cả — chỉ cần một lượt đọc hỏng.
--   (C) GHI HỤT KHÔNG AI BIẾT. `setGuildSetting` trả boolean nhưng kết quả bị bỏ trôi: ghi
--       hụt thì hàm vẫn `return n`, bài vẫn đăng với số n, và bài sau lại lấy đúng n đó.
--       Tức là chính lớp lỗi "làm rồi không kiểm kết quả" vừa đóng 14 chỗ ở
--       `f682637`/`7ae95a6` — lần đó cổng `ghi_hut_phai_noi_that` không thấy chỗ này vì
--       `setGuildSetting` không nằm trong danh sách hàm nó canh, và vì đây là helper gọi
--       helper NGAY TRONG `database.js` chứ không phải ở tầng lệnh. Cổng đã được nới.
--
-- CÁCH VÁ. Một câu `insert … on conflict do update … returning`. Postgres khoá dòng xung đột
-- rồi mới chạy nhánh DO UPDATE, và nhánh đó đọc bản MỚI NHẤT đã commit của dòng — nên hai
-- lượt gọi song song tự xếp hàng, không cần `for update` rời. `returning` trả về đúng giá trị
-- vừa ghi, nên số được cấp và số được lưu KHÔNG THỂ lệch nhau: hết luôn cả (A) và (C). Và vì
-- phép tăng đọc trực tiếp từ dòng trong DB, không còn chỗ nào cho `{}` của (B) chen vào.
--
-- QUY MÔ THẬT (đo prod 23/10): đúng **2** server từng có `confession_count`, giá trị 1 và 2.
-- Vá vì Luật 1 là bất khả xâm phạm và cách vá rẻ, KHÔNG vì đây là bề mặt nóng.
--
-- GIÁ TRỊ CŨ LƯU DẠNG CHUỖI JSON. `set_guild_setting` nhận `p_value text` rồi
-- `jsonb_build_object(p_key, p_value)`, nên hai dòng đang có là `"1"` / `"2"` (jsonb string)
-- chứ không phải số. Hàm này đọc bằng `->>` (luôn ra text) rồi mới ép số, nên đọc được cả
-- hai dạng; phần GHI thì ghi dạng SỐ cho đúng kiểu. Không cần migrate dữ liệu cũ.
--
-- CỐ Ý KHÔNG BỌC `exception when invalid_text_representation`: nếu giá trị trong DB là rác
-- không ép được số thì để câu lệnh ném lỗi, helper trả `null`, và lệnh nói thật là chưa cấp
-- được số. Bắt lỗi rồi coi như 0 là tự tay tái tạo đúng lỗi (B) ở trên.
--
-- SECURITY INVOKER, giống `set_guild_setting` (`prosecdef = false`) — đo trước rồi mới viết,
-- đừng suy từ mẫu của RPC khác. `create or replace` đặt lại ACL nên phải REVOKE/GRANT ở cuối.
-- ============================================================

create or replace function public.next_confession_number(p_guild text)
returns integer
language plpgsql
set search_path to 'pg_catalog', 'public'
as $fn$
declare v_n integer;
begin
    insert into guild_settings (guild_id, settings)
         values (p_guild, jsonb_build_object('confession_count', 1))
    on conflict (guild_id) do update
        set settings = guild_settings.settings
                       || jsonb_build_object(
                              'confession_count',
                              coalesce(nullif(guild_settings.settings ->> 'confession_count', '')::integer, 0) + 1
                          ),
            updated_at = now()
    returning (settings ->> 'confession_count')::integer into v_n;
    return v_n;
end; $fn$;

revoke all on function public.next_confession_number(text) from public, anon, authenticated;
grant execute on function public.next_confession_number(text) to service_role;

-- ============================================================
-- NGHIỆM THU (23/10/2026, chạy thật trên test rồi prod)
--
-- 1. CẤP SỐ ĐÚNG: server mới → 1, rồi 2, 3… ; server đã có giá trị CHUỖI `"7"` của
--    `set_guild_setting` cũ → trả 8 (đọc được dạng cũ), và từ đó lưu dạng SỐ.
-- 2. KHÔNG ĐẠP LÊN KHOÁ KHÁC: các khoá cùng dòng (`confession_channel`…) còn nguyên sau khi
--    tăng — vì dùng `||` để trộn chứ không ghi đè cả cột `settings`.
-- 3. KHÔNG TRÙNG SỐ khi gọi liên tiếp: 50 lượt gọi cho ra đúng 50 số phân biệt, liền mạch.
-- 4. QUYỀN: `anon`/`authenticated` không gọi được, `service_role` gọi được, `prosecdef` =
--    false, `search_path` pin. `check-rpc-anon`/`check-db` xác nhận trên cả hai DB.
-- ============================================================

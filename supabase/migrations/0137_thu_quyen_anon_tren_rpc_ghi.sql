-- ============================================================
-- 0137_thu_quyen_anon_tren_rpc_ghi.sql — Đóng toàn bộ RPC ghi dữ liệu khỏi khoá công khai
--
-- LỖ HỔNG (nghiêm trọng, khai thác được từ trình duyệt bất kỳ, không cần đăng nhập):
-- 75 hàm RPC ghi dữ liệu trong schema `public` đang gọi được bằng khoá `anon` — khoá này
-- nằm sẵn trong bundle JavaScript của web, ai xem mã nguồn trang cũng lấy được.
--
-- ĐÃ CHỨNG MINH BẰNG THỰC NGHIỆM (2026-08-24), không phải suy đoán từ bảng quyền:
--   POST /rest/v1/rpc/transfer_money  + khoá anon  ->  HTTP 200, hàm CHẠY THẬT
--   (truyền p_amount = 0 nên hàm tự chối, không đồng nào dịch chuyển — chỉ dùng để dò)
--   Đối chứng: loan_create bản 6 tham số đã REVOKE ->  HTTP 401 permission denied
--   Hai kết quả khác nhau chứng minh: chặn thì chặn được, và 75 hàm kia ĐANG KHÔNG bị chặn.
--
-- Khai thác được ngay, không cần điều kiện gì thêm:
--   transfer_money(<ví bất kỳ>, <ví kẻ tấn công>, <số tiền>)   -> cướp sạch tiền người khác
--   quest_claim(...)      -> người gọi TỰ KHAI số thưởng, thành máy in tiền
--   add_exp / give_item   -> tự phát cấp độ và vật phẩm
--   take_item / divorce_user / clan_war  -> phá hoại người khác
--   set_guild_setting     -> đổi cấu hình bot của SERVER BẤT KỲ, gồm cả chống nuke
--
-- VÌ SAO CỔNG CŨ KHÔNG BẮT ĐƯỢC: `scripts/check-sql-policy.js` quét CHỮ trong file
-- migration để tìm `GRANT ... TO anon`. Nhưng ở đây KHÔNG AI GRANT CẢ — Postgres mặc
-- định cho PUBLIC quyền EXECUTE trên mọi hàm vừa tạo. Lỗ hổng nằm ở điều Postgres lặng
-- lẽ làm, không nằm ở điều migration viết ra, nên quét văn bản không bao giờ thấy.
-- Cổng mới `scripts/check-rpc-anon.js` vì thế hỏi thẳng DB thật, không đọc file.
--
-- KHÔNG LÀM GÃY GÌ (đã kiểm từng đường):
--   · bot   : kết nối bằng SUPABASE_SERVICE_KEY  -> vai trò service_role, được GRANT dưới đây
--   · web   : cả 14 lời gọi .rpc() đều qua createAdminClient() = service_role.
--             `web/src/lib/supabase/admin.ts` NÉM LỖI ở production khi thiếu service key,
--             không âm thầm tụt xuống anon, nên không có đường nào chạy RPC bằng anon.
--   · Thu quyền EXECUTE trên HÀM không đụng gì tới quyền SELECT trên BẢNG, nên client
--     anon của web (`server.ts`) vẫn đọc bảng bình thường qua RLS.
--
-- GIỮ NGUYÊN cho anon (4 hàm chỉ-đọc, vô hại): get_public_profile (cố ý công khai),
-- market_block, market_multiplier, market_unit_price (chỉ tính giá, không lộ dữ liệu ai).
-- ============================================================

-- 1) Bản `loan_create` 5 tham số mồ côi: migration 0136 tạo bản 6 tham số nhưng không xoá
--    bản cũ. Nó ghi cứng phí 5% (lệch nguồn với config), và hiện chỉ "an toàn" nhờ tai nạn
--    — PostgREST trả PGRST203 vì không chọn nổi giữa hai bản trùng tên. Đó không phải một
--    lớp bảo vệ. Không còn ai gọi (db.loanCreate luôn truyền p_fee_pct).
drop function if exists public.loan_create(text, text, bigint, numeric, integer);

-- 2) Thu quyền trên mọi hàm CÓ GHI dữ liệu. Duyệt theo danh mục hệ thống thay vì chép tay
--    75 chữ ký: chép tay thì sót, và sót ở đây nghĩa là để hở một đường cướp tiền.
do $$
declare r record; n int := 0;
begin
    for r in
        select p.oid::regprocedure::text as sig
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public'
          and p.prokind = 'f'
          and pg_get_functiondef(p.oid) ~* '\m(insert|update|delete)\M'
    loop
        execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
        execute format('grant  execute on function %s to service_role', r.sig);
        n := n + 1;
    end loop;
    raise notice 'Đã đóng % hàm RPC ghi dữ liệu khỏi anon/authenticated/PUBLIC.', n;
end $$;

-- 3) Chặn tái phát. Nếu không có dòng này, hàm TIẾP THEO ai đó viết lại mở cho PUBLIC theo
--    mặc định của Postgres, và cả bài học này bốc hơi ngay ở migration sau.
alter default privileges in schema public revoke execute on functions from public;

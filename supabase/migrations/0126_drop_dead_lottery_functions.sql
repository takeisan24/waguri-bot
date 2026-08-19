-- ============================================================
-- 0126 — Xoá 5 hàm xổ số CHẾT. GIỮ NGUYÊN hai bảng.
--
-- PHÁT HIỆN: quét tham chiếu CỘT trong thân hàm (thứ gate 0123 chưa soi — nó chỉ soi tên
-- BẢNG) tìm ra `lottery_buy` ghi vào hai chỗ không tồn tại:
--     update lottery_state set pool = ...        -- lottery_state KHÔNG có cột `pool`
--     insert into lottery_tickets(..., tickets)  -- lottery_tickets KHÔNG có cột `tickets`
-- Gọi vào là lỗi ngay. Nhưng không ai gọi cả.
--
-- ĐÃ KIỂM ĐỦ TRƯỚC KHI XOÁ (repo công khai, prod thật — không đoán):
--   · Không lệnh nào trong src/commands dùng; không file nào trong src/ hay web/src/ gọi
--   · Không hàm nào khác trong public gọi tới 5 hàm này
--   · pg_cron CHƯA CÀI -> không có lịch chạy ngầm nào gọi
--   · Không trigger, không view, không khoá ngoại trỏ tới
--   · lottery_state: 0 dòng · lottery_tickets: 0 dòng -> không mất dữ liệu
--
-- VÌ SAO GIỮ LẠI HAI BẢNG (thu hẹp phạm vi có chủ ý):
-- Hai nơi ĐANG CHẠY TỐT còn tham chiếu `lottery_tickets`:
--   · RPC `delete_user_data` — có dòng `DELETE FROM lottery_tickets` viết cứng
--   · `resetUser()` trong src/database.js — bảng nằm trong danh sách CHILDREN
-- Xoá bảng buộc phải sửa cả hai, tức chạm vào ĐƯỜNG XOÁ DỮ LIỆU NGƯỜI DÙNG, chỉ để đổi lấy
-- sự gọn gàng. Hai bảng rỗng không tốn gì và không gây hại. Lợi ích không đáng rủi ro đó.
--
-- Xoá hàm là đủ để đạt mục tiêu: chúng chính là phần MANG LỖI, và là thứ làm nhiễu phép quét
-- cột ở migration kế tiếp.
-- ============================================================

-- Chữ ký lấy từ `pg_get_function_identity_arguments` chứ không viết theo trí nhớ: sai một
-- kiểu thì `drop ... if exists` im lặng không xoá gì, và migration trông như đã thành công.
drop function if exists public.lottery_buy(p_user_id text, p_count integer, p_price bigint, p_cut numeric, p_secs integer);
drop function if exists public.lottery_claim_ticket(p_user_id text, p_ticket_number text, p_def_reward_type text, p_def_reward_value text, p_def_reward_name text, p_duration_secs integer);
drop function if exists public.lottery_save_draw_result(p_round_no integer, p_winning_number text, p_next_reward_type text, p_next_reward_value text, p_next_reward_name text, p_duration_secs integer, p_last_winner_desc text, p_last_reward_desc text);
drop function if exists public.lottery_settle(p_cut numeric, p_secs integer);
drop function if exists public.lottery_view(p_user_id text, p_cut numeric, p_secs integer);

-- Chốt: phải thực sự biến mất, và hai bảng phải CÒN NGUYÊN.
do $$
declare v_ham int; v_bang int;
begin
    select count(*) into v_ham
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'lottery%';
    if v_ham > 0 then
        raise exception '[0126] Van con % ham lottery_* — chu ky drop khong khop.', v_ham;
    end if;

    select count(*) into v_bang from pg_tables
     where schemaname = 'public' and tablename in ('lottery_state', 'lottery_tickets');
    if v_bang <> 2 then
        raise exception '[0126] Hai bang lottery PHAI con nguyen (dang co %) — delete_user_data va resetUser() phu thuoc.', v_bang;
    end if;
end $$;

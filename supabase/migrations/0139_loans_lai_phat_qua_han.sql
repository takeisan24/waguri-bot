-- ============================================================
-- 0139_loans_lai_phat_qua_han.sql — Ba cột để tính lãi phạt quá hạn KHÔNG bị trùng/hụt
--
-- VÌ SAO CẦN CỘT RIÊNG: `remaining` giảm mỗi lần trả nợ, nên không suy ngược ra được đã
-- phạt bao nhiêu. Nếu mỗi lượt chạy cứ cộng thêm một cách mù thì chạy hai lần trong ngày
-- là phạt gấp đôi, chạy trễ là phạt hụt — và `economy_ledger` sẽ không bao giờ khớp.
-- Ba cột dưới đây cho phép tính theo MỐC THỜI GIAN: chạy bao nhiêu lần cũng ra một kết quả.
--
--   due_amount   số phải trả ban đầu, BẤT BIẾN — làm gốc tính trần (không dùng `remaining`
--                vì nó thay đổi, cũng không dùng `principal` vì nó chưa gồm lãi)
--   late_total   tổng đã phạt, để áp trần
--   late_through đã phạt tới thời điểm nào, để không phạt trùng
--
-- BACKFILL — quyết định có cân nhắc: `late_through` đặt = now() chứ KHÔNG phải due_at.
-- Hai khoản đang treo đã quá hạn 58 ngày; nếu tính hồi tố thì chúng đụng trần ngay lập tức
-- (22.000 -> 33.000 xu) vì một luật vừa mới ra đời hôm nay. Phạt người ta theo luật chưa
-- tồn tại lúc họ vay là sai, và đó đúng là loại thay đổi âm thầm sinh mất uy tín.
-- Nên: chỉ phạt từ thời điểm luật có hiệu lực trở đi.
--
-- due_amount backfill = `remaining`: đúng cho dữ liệu hiện có vì chưa khoản nào được trả
-- một đồng (đã kiểm trên prod: 2 khoản, 0 lượt trả). Với khoản trả dở thì `remaining` nhỏ
-- hơn số phải trả gốc, nhưng không tồn tại khoản nào như vậy.
-- ============================================================

alter table loans add column if not exists due_amount   bigint;
alter table loans add column if not exists late_total   bigint      not null default 0;
alter table loans add column if not exists late_through timestamptz;

update loans set due_amount = remaining where due_amount is null;
update loans set late_through = now()    where late_through is null;

alter table loans alter column due_amount   set not null;
alter table loans alter column late_through set not null;

-- Hàm tự thu chạy nền quét theo điều kiện này mỗi 12 giờ; không có index thì mỗi lượt là
-- một seq scan trên toàn bảng nợ.
create index if not exists idx_loans_qua_han on loans (due_at) where status = 'active';

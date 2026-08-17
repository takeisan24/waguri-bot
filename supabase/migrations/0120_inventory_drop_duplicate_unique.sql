-- ============================================================
-- 0120 — Bỏ ràng buộc UNIQUE trùng lặp trên bảng `inventory`.
--
-- HIỆN TRẠNG (đo trên prod 2026-08-17):
--   inventory_user_id_item_id_key   UNIQUE (user_id, item_id)   <- sinh tự động từ CREATE TABLE
--   inventory_user_item_unique      UNIQUE (user_id, item_id)   <- 0003_buy_item.sql thêm vào
-- Hai định nghĩa GIỐNG HỆT nhau. Mỗi lần ghi kho đồ (câu cá, chế đồ, hái lượm, mua hàng)
-- Postgres phải cập nhật hai cây B-tree y hệt — một nửa công đó là vô ích.
--
-- GỐC RỄ: `0003_buy_item.sql:12` bọc lệnh ADD CONSTRAINT trong
--   `if not exists (select 1 from pg_constraint where conname = 'inventory_user_item_unique')`
-- tức nó chỉ hỏi "đã có ràng buộc TÊN NÀY chưa", không hỏi "đã có ràng buộc CÙNG CỘT chưa".
-- Ràng buộc tương đương đã tồn tại sẵn dưới tên tự sinh, nên điều kiện luôn đúng và bản
-- trùng luôn được tạo. Migration này chạy SAU 0003 nên khi dựng DB mới từ đầu, trạng thái
-- cuối vẫn đúng: tạo bảng -> 0003 thêm bản trùng -> 0120 bỏ đi.
--
-- AN TOÀN: không nơi nào gọi đích danh tên ràng buộc — repo chỉ có 0003 nhắc tới nó, và
-- 0 hàm nào trong public dùng `ON CONFLICT ON CONSTRAINT` (đã truy vấn pg_get_functiondef).
-- Ràng buộc GIỮ LẠI là bản tự sinh, vì nó gắn liền với định nghĩa bảng.
--
-- Khối dưới chỉ bỏ khi CẢ HAI cùng tồn tại VÀ định nghĩa khớp nhau từng ký tự. Nếu ai đó
-- đã sửa một trong hai thành ràng buộc khác cột, migration lặng lẽ không làm gì thay vì
-- xoá nhầm một ràng buộc đang có tác dụng riêng.
-- ============================================================

do $$
declare
    dn_giu  text;
    dn_bo   text;
begin
    select pg_get_constraintdef(c.oid) into dn_giu
    from pg_constraint c join pg_class t on t.oid = c.conrelid
    where t.relname = 'inventory' and c.conname = 'inventory_user_id_item_id_key';

    select pg_get_constraintdef(c.oid) into dn_bo
    from pg_constraint c join pg_class t on t.oid = c.conrelid
    where t.relname = 'inventory' and c.conname = 'inventory_user_item_unique';

    if dn_giu is null or dn_bo is null then
        raise notice '[0120] Bỏ qua: không đủ hai ràng buộc (giu=%, bo=%).', dn_giu, dn_bo;
    elsif dn_giu is distinct from dn_bo then
        raise notice '[0120] Bỏ qua: hai ràng buộc KHÁC nhau (% vs %) — không phải bản trùng.', dn_giu, dn_bo;
    else
        alter table inventory drop constraint inventory_user_item_unique;
        raise notice '[0120] Đã bỏ inventory_user_item_unique (trùng với inventory_user_id_item_id_key: %).', dn_giu;
    end if;
end $$;

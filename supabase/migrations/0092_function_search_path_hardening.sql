-- 0092: Chốt search_path cho 4 hàm còn thiếu (advisor: function_search_path_mutable, WARN).
-- Hàm không đặt search_path có thể bị "search_path hijacking": kẻ tấn công tạo object cùng tên ở
-- schema khác trên đường tìm kiếm. Đặt cố định = public, pg_temp là chuẩn an toàn, KHÔNG đổi hành vi.
-- (Không đụng RLS/GraphQL grants ở đây: web đọc nhiều bảng qua client anon/authenticated dưới RLS,
--  nên siết SELECT/policy phải rà từng bảng trên DB thật — để riêng, không gộp vào migration này.)
ALTER FUNCTION public.regen_energy(text)              SET search_path = public, pg_temp;
ALTER FUNCTION public.spend_energy(text, integer)     SET search_path = public, pg_temp;
ALTER FUNCTION public.consume_item(text, text)        SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_bakery_likes_count()       SET search_path = public, pg_temp;

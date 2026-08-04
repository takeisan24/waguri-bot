-- ============================================================
-- 0097_leaderboard_rank_indexes.sql — Index cho đường nóng xếp hạng/BXH
--
-- user_wealth_rank (0096) chạy `SELECT count(*) FROM users WHERE (wallet+bank) > X` MỖI lượt xem
-- hồ sơ/BXH — trước đây là FULL SEQ SCAN (rào cản free-tier #1 khi user tăng). leaderboard_rows /
-- level board cũng ORDER BY (wallet+bank) / exp không index. Thêm 2 index biểu thức để biến các
-- truy vấn này thành index range/top-N. An toàn, chỉ đọc nhanh hơn, không đổi hành vi.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_networth ON public.users ((wallet + bank) DESC);
CREATE INDEX IF NOT EXISTS idx_users_exp ON public.users (exp DESC);

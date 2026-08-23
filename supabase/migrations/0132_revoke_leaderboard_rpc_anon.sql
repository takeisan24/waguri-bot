-- ============================================================
-- 0132_revoke_leaderboard_rpc_anon.sql
--
-- Thu hồi quyền gọi 4 hàm bảng xếp hạng khỏi `anon` và `authenticated`.
--
-- VÌ SAO: cả bốn đều là SECURITY DEFINER và đều được GRANT cho anon ở 0091/0096/0099. Nhưng
-- rà lại toàn bộ nơi gọi (2026-08-23) thì KHÔNG chỗ nào cần quyền đó — mọi lời gọi đều đi
-- qua service_role:
--
--   web/src/app/leaderboard/page.tsx:74,215   createAdminClient()
--   web/src/app/api/leaderboard/route.ts:64   createAdminClient()
--   web/src/app/u/[id]/page.tsx:84            createAdminClient()
--   src/database.js:2064,2733                 supabase (service_role)
--
-- Khoá anon nằm ngay trong bundle JavaScript của web, ai cũng đọc được. Nên GRANT cho anon
-- nghĩa là mở bốn hàm này ra Internet qua /rest/v1/rpc/<tên>.
--
-- HẬU QUẢ CỤ THỂ, không phải lo xa: `user_wealth_rank(p_user)` là hàm DUY NHẤT trong bốn cái
-- KHÔNG kiểm `users.profile_public` (ba hàm kia đều có). Trang /u/[id] có chặn hồ sơ ẩn ở
-- dòng 66, nhưng REST API thì không đi qua trang. Nên bất kỳ ai cũng gọi thẳng được:
--
--     POST /rest/v1/rpc/user_wealth_rank  {"p_user": "<discord id>"}
--
-- và nhận về thứ hạng tài sản của một người ĐÃ CHỌN ẩn hồ sơ. Ghép với bảng xếp hạng công
-- khai (vốn hiện số dư của người để công khai), biết thứ hạng là kẹp được tài sản của họ
-- giữa hai mốc liền kề. Tức lựa chọn riêng tư của người dùng bị vô hiệu.
--
-- Sửa bằng cách thu quyền chứ không sửa thân hàm: thân hàm đang đúng cho mục đích của nó
-- (service_role gọi để dựng trang), và thêm điều kiện `profile_public` vào đó sẽ làm chính
-- người dùng không xem được hạng của mình khi họ đặt hồ sơ ẩn.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.user_wealth_rank(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.user_wealth_rank(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.leaderboard_rows(text, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.leaderboard_rows(text, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.leaderboard_rows_guild(text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.leaderboard_rows_guild(text, integer, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_bakery_leaderboard(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_bakery_leaderboard(integer, integer) TO service_role;

-- ============================================================
-- 0162_xoa_ham_hoan_thue_lap.sql — Xoá hàm bồi hoàn dùng một lần của 0161
--
-- `hoan_thue_lap(p_user_id, p_so_xu, p_dot)` cộng một số tiền TUỲ Ý vào bank. Dù đã khoá
-- quyền chỉ service_role và có trần 1.100.000/lần, để nó sống mãi là để lại một cánh
-- cửa in tiền không còn việc gì để làm (chủ repo chốt Q2 = a).
--
-- Việc của nó đã xong (07-11-2026): 2 đợt, 13 người, tổng 1.786.717 xu — biên lai trong
-- `hoan_thue_lap_bien_lai` khớp tổng sổ `economy_ledger` nhãn `hoan_thue_lap`.
--
-- GIỮ bảng `hoan_thue_lap_bien_lai` làm biên lai lâu dài (sổ giao dịch tự dọn sau 30
-- ngày). Gói sau: thêm bảng này vào việc xoá của `delete_user_data` (/deletedata).
-- Helper `db.hoanThueLap()` và `scripts/hoan-thue-lap.js` bị xoá trong cùng commit.
--
-- Idempotent.
-- ============================================================

DROP FUNCTION IF EXISTS public.hoan_thue_lap(TEXT, BIGINT, TEXT);

-- ============================================================
-- 0116_clan_war_cooldown_column_recover.sql — Cứu cột bị trùng số hiệu nuốt mất
--
-- 🟠 HIGH — do gate `check-db-applied` (Đợt 3) tìm ra NGAY LẦN CHẠY ĐẦU TIÊN.
--
-- BỐI CẢNH: có HAI file mang số 0091 —
--     0091_clan_war_cooldown_column.sql        <- chưa bao giờ được áp
--     0091_public_leaderboard_security_definer.sql
-- Chỉ file thứ hai vào được DB. Cột `clans.war_cd_until` không tồn tại trên prod.
--
-- ĐÂY LÀ LẦN THỨ BA cùng một gốc rễ: `0096_fix_market_item_ids` (→ chợ bán mọi thứ 500 xu),
-- `0080_user_locale` (→ ghi nhớ ngôn ngữ chết), và nay `0091_clan_war_cooldown_column`.
--
-- HẬU QUẢ ĐANG DIỄN RA TRÊN PROD:
--   · `clan.js:178` đọc `myClan.war_cd_until` -> luôn undefined -> `cdUntil = 0`
--     -> `if (Date.now() < 0)` KHÔNG BAO GIỜ đúng -> **tuyên chiến clan không có cooldown**
--   · `db.setClanWarCooldown()` ghi vào cột không tồn tại -> lỗi bị catch nuốt, trả false,
--     không ai kiểm giá trị trả về
--   · Map cooldown trong RAM đã bị GỠ khi chuyển sang DB (grep `warCooldown` = 0 kết quả)
--     -> hiện KHÔNG CÒN cơ chế cooldown nào cả
-- Mỗi trận chiến cược tiền thật từ quỹ bang (`config.CLAN.WAR_STAKE`) nên đây là bỏ qua
-- ràng buộc thiết kế trên đường tiền => HIGH theo ngưỡng đã chốt.
--
-- Idempotent. Nullable có chủ ý: NULL = "chưa từng tuyên chiến", đúng ngữ nghĩa và tránh
-- đúng cái bẫy `NOT NULL DEFAULT` đã gặp ở `0080_user_locale`.
-- ============================================================

ALTER TABLE public.clans ADD COLUMN IF NOT EXISTS war_cd_until timestamptz;

COMMENT ON COLUMN public.clans.war_cd_until IS
    'Moc het cooldown tuyen chien clan. NULL = chua tung tuyen chien. Luu o DB thay vi RAM de ben qua restart va dong nhat giua cac shard.';

-- ============================================================
-- VERIFY:
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_name='clans' AND column_name='war_cd_until';   -> war_cd_until | YES
--   Rồi: `/clan war` hai lần liên tiếp -> lần hai phải báo còn cooldown.
-- ============================================================

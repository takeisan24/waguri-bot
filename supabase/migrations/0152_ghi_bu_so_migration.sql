-- ============================================================
-- 0152_ghi_bu_so_migration.sql — Ghi bù sổ migration cho 0149/0150/0151.
--
-- VÌ SAO CÓ: audit 2026-10-08 thấy file migration trên đĩa tới `0151` nhưng
-- `supabase_migrations.schema_migrations` chỉ tới `0148`. Đã verify từng đối tượng:
-- cả 3 migration ĐÃ ÁP ĐỦ trên test và prod (advance_story_node, buy_study_shop_item,
-- market_multiplier có MurmurMix32, deliver_bakery_order, 2 bảng study_shop_catalog +
-- bakery_completed_orders đều tồn tại). Chúng chỉ được áp bằng `execute_sql` nên
-- không đi qua đường ghi sổ.
--
-- VÌ SAO PHẢI SỬA: sổ rỗng khiến hai việc hỏng âm thầm —
--   1. `supabase db push` / dựng lại DB từ file sẽ tưởng 3 migration này CHƯA áp và
--      chạy lại. Chúng KHÔNG idempotent hoàn toàn: `CREATE POLICY` không có
--      `IF NOT EXISTS`, nên lần chạy lại vỡ giữa đường, để DB ở trạng thái nửa vời.
--   2. `list_migrations` là thứ người ta tin khi hỏi "DB đang ở đâu" — sổ sai thì
--      mọi phán đoán sau đó sai theo. Đúng hạng lỗi đã gây sự cố chợ tháng 8/2026
--      (trùng số migration -> file không bao giờ được áp -> bán mọi thứ 500 xu).
--
-- MỐC THỜI GIAN: dùng ngày commit của chính file đó (0149 -> 11/09, 0150+0151 -> 21/09)
-- để thứ tự trong sổ khớp thứ tự đã áp thật, không phải ngày ghi bù.
--
-- Idempotent bằng NOT EXISTS (không dùng ON CONFLICT: không phụ thuộc vào việc
-- `version` có ràng buộc UNIQUE hay không trên mọi phiên bản Supabase).
-- ============================================================

INSERT INTO supabase_migrations.schema_migrations (version, name)
SELECT v.version, v.name
  FROM (VALUES
          ('20260911145000', '0149_gekka_study_story_quests'),
          ('20260921150000', '0150_market_avalanche_hash'),
          ('20260921150100', '0151_bakery_vip_orders')
       ) AS v(version, name)
 WHERE NOT EXISTS (
         SELECT 1 FROM supabase_migrations.schema_migrations m
          WHERE m.version = v.version
       );

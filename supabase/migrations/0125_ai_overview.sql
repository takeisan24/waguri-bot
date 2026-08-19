-- ============================================================
-- 0125 — `ai_overview()`: một cái nhìn tổng quan về AI cho chủ dự án.
--
-- VÌ SAO CẦN: server lớn nhất (193 người) TẮT AI suốt 5 ngày mà không ai biết. Nó chỉ lộ ra
-- khi có người ngồi chạy SQL tay. Đó là cùng một lớp vấn đề với các cột đo lường hỏng: thứ
-- không ai NHÌN THẤY thì không ai sửa.
--
-- Mọi con số về AI trong ba ngày qua đều do trợ lý chạy SQL. Chủ dự án không có cách nào tự
-- xem — mà giai đoạn tới chính là giai đoạn cần theo dõi (vừa mở khoá 220 người, vừa chờ
-- dữ liệu giữ chân).
--
-- CHỈ ĐỌC, không sửa gì. Dùng cho `/eco-admin report` (owner-only).
-- ============================================================

create or replace function public.ai_overview()
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
    SELECT jsonb_build_object(
        -- Hôm nay: bao nhiêu người trò chuyện, tổng bao nhiêu lượt.
        -- `daily_affection_sum` reset theo ngày trong add_affection_v2 nên là số lượt HÔM NAY.
        'hom_nay', (
            SELECT jsonb_build_object(
                'nguoi', count(*),
                'luot',  coalesce(sum(daily_affection_sum), 0)
            )
            FROM users WHERE last_affection_date = current_date
        ),

        -- Tích luỹ. `affection_days >= 2` là thước đo GIỮ CHÂN đầu tiên đáng tin của dự án
        -- (có từ 0124); số trước 2026-08-18 là sàn do backfill, không phải lịch sử thật.
        'tich_luy', (
            SELECT jsonb_build_object(
                'nguoi_tung_chat',   count(*) FILTER (WHERE coalesce(affection, 0) > 0),
                'quay_lai_2_ngay',   count(*) FILTER (WHERE coalesce(affection_days, 0) >= 2),
                'diem_cao_nhat',     coalesce(max(affection), 0)
            )
            FROM users
        ),

        -- Ngân sách chung hôm nay (bộ đếm của 0124 + config.AI.GLOBAL_DAILY phía bot).
        -- `day` khác hôm nay nghĩa là hôm nay chưa tiêu lượt nào.
        'ngan_sach_da_dung', (
            SELECT coalesce(
                (SELECT count FROM daily_counters
                  WHERE user_id = '__ai_global__' AND day = current_date), 0)
        ),

        -- Server ĐANG TẮT AI, kèm số người — đây là mục quan trọng nhất của cả hàm.
        'server_tat_ai', (
            SELECT coalesce(jsonb_agg(jsonb_build_object('guild_id', g.guild_id, 'so_nguoi', g.so_nguoi)
                                      ORDER BY g.so_nguoi DESC), '[]'::jsonb)
            FROM (
                SELECT gs.guild_id, count(DISTINCT gm.user_id) AS so_nguoi
                  FROM guild_settings gs
                  JOIN guild_members gm ON gm.guild_id = gs.guild_id
                 WHERE gs.settings->>'ai_enabled' = '0'
                 GROUP BY gs.guild_id
            ) g
        ),

        -- Server chỉ cho AI nói ở MỘT kênh. Không sai, nhưng người ngoài kênh đó dễ tưởng
        -- bot hỏng — nên vẫn cần thấy được.
        'server_gioi_han_kenh', (
            SELECT coalesce(jsonb_agg(jsonb_build_object('guild_id', g.guild_id, 'so_nguoi', g.so_nguoi)
                                      ORDER BY g.so_nguoi DESC), '[]'::jsonb)
            FROM (
                SELECT gs.guild_id, count(DISTINCT gm.user_id) AS so_nguoi
                  FROM guild_settings gs
                  JOIN guild_members gm ON gm.guild_id = gs.guild_id
                 WHERE gs.settings->>'ai_channel' IS NOT NULL
                   AND coalesce(gs.settings->>'ai_enabled', '1') <> '0'
                 GROUP BY gs.guild_id
            ) g
        )
    );
$function$;

revoke all on function public.ai_overview() from public, anon, authenticated;
grant execute on function public.ai_overview() to service_role;

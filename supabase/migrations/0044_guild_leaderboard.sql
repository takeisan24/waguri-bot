-- ============================================================
-- 0044_guild_leaderboard.sql — BXH theo từng server
-- Kinh tế là global (1 ví/người dùng chung mọi server). Để /leaderboard có thể
-- xếp hạng RIÊNG trong 1 server, ta ghi nhận "user nào từng hoạt động ở guild nào"
-- (bảng guild_members, đổ dần khi user dùng lệnh/chat) rồi join khi xếp hạng.
-- KHÔNG đặt FK tới users để tránh lệ thuộc thứ tự tạo user; dòng mồ côi vô hại
-- (join sẽ tự bỏ qua user không tồn tại).
-- ============================================================

CREATE TABLE IF NOT EXISTS guild_members (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON guild_members(guild_id);

-- BXH giới hạn trong 1 guild (networth hoặc level).
CREATE OR REPLACE FUNCTION leaderboard_rows_guild(p_sort TEXT, p_limit INT, p_guild TEXT)
RETURNS TABLE(user_id TEXT, networth BIGINT, exp INT)
LANGUAGE sql AS $$
    SELECT u.user_id, (u.wallet+u.bank)::bigint AS networth, u.exp
    FROM users u
    JOIN guild_members gm ON gm.user_id = u.user_id AND gm.guild_id = p_guild
    ORDER BY CASE WHEN p_sort='level' THEN u.exp::bigint ELSE (u.wallet+u.bank) END DESC
    LIMIT p_limit
$$;

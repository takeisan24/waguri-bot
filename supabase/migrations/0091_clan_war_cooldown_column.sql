-- 0091: Cooldown "tuyên chiến clan" chuyển từ RAM (Map trong clan.js) sang DB.
-- Trước đây warCooldown là Map in-memory: restart bot là reset (bypass cooldown, tuyên chiến
-- liên tục) và không shard-safe (mỗi shard 1 bản Map). Lưu mốc hết cooldown ngay trên hàng clan
-- để bền vững qua restart & đồng nhất giữa các shard.
ALTER TABLE public.clans ADD COLUMN IF NOT EXISTS war_cd_until timestamptz;

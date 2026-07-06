// web/src/app/dashboard/pass/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../lib/discord";
import { getCurrentSeasonId } from "../../../lib/game";
import * as rewardsConfig from "../../../data/battlepass_rewards";

// Server Action: Mua Sổ Sứ Mệnh Premium
export async function buyPremiumPassAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Chưa đăng nhập!" };

  const { id } = getDiscordIdentity(user);
  if (!id) return { success: false, error: "Lỗi danh tính Discord!" };

  const seasonId = getCurrentSeasonId();
  const admin = createAdminClient();

  const { data: res, error } = await admin.rpc("buy_premium_pass", {
    p_user_id: id,
    p_season_id: seasonId,
    p_cost: rewardsConfig.PREMIUM_COST,
  });

  if (error) {
    console.error("[BUY PASS ACTION ERROR]", error);
    return { success: false, error: "Lỗi kết nối cơ sở dữ liệu!" };
  }

  if (res === "ok") {
    revalidatePath("/dashboard/pass");
    revalidatePath("/dashboard");
    return { success: true };
  }

  const errMap: { [key: string]: string } = {
    insufficient_funds: "Cậu không đủ xu ảo trong ví để mua Premium Pass rồi!",
    already_premium: "Cậu đã sở hữu Premium Pass của mùa giải này rồi!",
    user_not_found: "Không tìm thấy tài khoản người chơi!",
  };

  return { success: false, error: errMap[res as string] || `Lỗi không xác định: ${res}` };
}

// Server Action: Nhận toàn bộ quà hợp lệ (claimAll)
export async function claimPassRewardsAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Chưa đăng nhập!" };

  const { id } = getDiscordIdentity(user);
  if (!id) return { success: false, error: "Lỗi danh tính Discord!" };

  const seasonId = getCurrentSeasonId();
  const admin = createAdminClient();

  // 1. Lấy thông tin Sổ Sứ Mệnh hiện tại của user
  const { data: bp, error: fetchErr } = await admin
    .from("battle_pass_users")
    .select("*")
    .eq("user_id", id)
    .eq("season_id", seasonId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[CLAIM PASS ACTION ERROR]", fetchErr);
    return { success: false, error: "Lỗi kết nối cơ sở dữ liệu!" };
  }

  // Nếu chưa có tiến trình, mặc định Level 0
  const bpXp = bp?.xp ?? 0;
  const currentLvl = Math.floor(bpXp / rewardsConfig.XP_PER_LEVEL);
  if (currentLvl === 0) {
    return { success: false, error: "Cấp độ Sổ Sứ Mệnh của cậu quá thấp (chưa đạt cấp 1) để nhận quà!" };
  }

  const freeClaimed = new Set((bp?.claimed_free as number[]) || []);
  const premiumClaimed = new Set((bp?.claimed_premium as number[]) || []);
  const isPremium = bp?.is_premium ?? false;

  const freeToClaim: number[] = [];
  const premiumToClaim: number[] = [];
  let totalCoins = 0;
  const itemsToGive: { [key: string]: number } = {};
  let finalTitle = "";

  // 2. Tính toán quà chưa nhận
  for (let l = 1; l <= currentLvl; l++) {
    const rewards = rewardsConfig.REWARDS[l];
    if (!rewards) continue;

    // Check Free
    if (rewards.free && !freeClaimed.has(l)) {
      freeToClaim.push(l);
      if (rewards.free.coins) totalCoins += rewards.free.coins;
      if (rewards.free.title) finalTitle = rewards.free.title;
      if (rewards.free.items) {
        for (const [itemId, qty] of Object.entries(rewards.free.items)) {
          itemsToGive[itemId] = (itemsToGive[itemId] || 0) + qty;
        }
      }
    }

    // Check Premium
    if (isPremium && rewards.premium && !premiumClaimed.has(l)) {
      premiumToClaim.push(l);
      if (rewards.premium.coins) totalCoins += rewards.premium.coins;
      if (rewards.premium.title) finalTitle = rewards.premium.title;
      if (rewards.premium.items) {
        for (const [itemId, qty] of Object.entries(rewards.premium.items)) {
          itemsToGive[itemId] = (itemsToGive[itemId] || 0) + qty;
        }
      }
    }
  }

  if (freeToClaim.length === 0 && premiumToClaim.length === 0) {
    return { success: false, error: "Cậu đã nhận hết phần thưởng khả dụng ở cấp độ hiện tại rồi!" };
  }

  const itemsArray = Object.entries(itemsToGive).map(([id, qty]) => ({ id, qty }));

  // 3. Gọi RPC claim
  const { data: res, error: claimErr } = await admin.rpc("claim_pass_rewards_bulk", {
    p_user_id: id,
    p_season_id: seasonId,
    p_free_levels: freeToClaim,
    p_premium_levels: premiumToClaim,
    p_reward_coins: totalCoins,
    p_reward_items: itemsArray,
    p_reward_title: finalTitle,
    p_xp_per_level: rewardsConfig.XP_PER_LEVEL,
  });

  if (claimErr) {
    console.error("[CLAIM PASS ACTION RPC ERROR]", claimErr);
    return { success: false, error: "Lỗi thực thi nhận quà trên cơ sở dữ liệu!" };
  }

  if (res === "ok") {
    revalidatePath("/dashboard/pass");
    revalidatePath("/dashboard");
    return {
      success: true,
      freeLevels: freeToClaim,
      premiumLevels: premiumToClaim,
      coins: totalCoins,
      items: itemsToGive,
      title: finalTitle,
    };
  }

  const errMap: { [key: string]: string } = {
    pass_not_found: "Không tìm thấy thông tin Sổ Sứ Mệnh!",
    level_locked: "Yêu cầu cấp độ quà vượt quá cấp độ Sổ Sứ Mệnh hiện có!",
    already_claimed: "Một trong các mốc phần thưởng đã được nhận từ trước rồi!",
    premium_locked: "Yêu cầu nhận quà nhánh Premium nhưng cậu chưa mở khóa Premium!",
  };

  return { success: false, error: errMap[res as string] || `Lỗi không xác định: ${res}` };
}

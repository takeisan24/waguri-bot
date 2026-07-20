"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";
import { createAdminClient } from "../../lib/supabase/admin";
import { getDiscordIdentity } from "../../lib/discord";
import { getLocaleServer } from "../../lib/i18n";

// Lấy Discord ID của phiên đăng nhập đã xác thực (không tin tham số từ client).
async function sessionDiscordId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return getDiscordIdentity(user).id;
}

export async function toggleProfilePublic() {
  const id = await sessionDiscordId();
  if (!id) return;
  const admin = createAdminClient();
  const { data } = await admin.from("users").select("profile_public").eq("user_id", id).single();
  const next = !((data?.profile_public ?? true) as boolean);
  await admin.from("users").update({ profile_public: next }).eq("user_id", id);
  revalidatePath("/dashboard");
}

export async function toggleVoteReminder() {
  const id = await sessionDiscordId();
  if (!id) return;
  const admin = createAdminClient();
  const { data } = await admin.from("users").select("vote_reminder").eq("user_id", id).single();
  const next = !((data?.vote_reminder ?? true) as boolean);
  await admin.from("users").update({ vote_reminder: next }).eq("user_id", id);
  revalidatePath("/dashboard");
}

export async function upgradePetSkill(skillId: string) {
  const userId = await sessionDiscordId();
  const locale = await getLocaleServer();
  const isEn = locale.startsWith("en");

  if (!userId) {
    return { success: false, error: isEn ? "Unauthorized session" : "Phiên làm việc chưa xác thực" };
  }

  const admin = createAdminClient();
  const { data: pet, error: petErr } = await admin
    .from("user_pets")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (petErr || !pet) {
    return { success: false, error: isEn ? "Pet not found" : "Không tìm thấy thú cưng" };
  }

  const skillPoints = pet.skill_points || 0;
  if (skillPoints <= 0) {
    return { success: false, error: isEn ? "No skill points available" : "Hết điểm kỹ năng rồi cậu ơi" };
  }

  // Allow-list các kỹ năng hợp lệ + cấp tối đa (khớp SKILL_LIST trong PetSkillTree.tsx).
  // KHÔNG suy ra maxLevel từ ternary: trước đây mọi skillId lạ bị coi là skill 3 cấp hợp lệ,
  // client tự chế có thể tiêm key tùy ý vào JSON `skills` (DB dùng chung với bot).
  const SKILL_MAX: Record<string, number> = { fishing_luck: 3, double_gem: 2, bakery_efficiency: 3 };
  const maxLevel = SKILL_MAX[skillId];
  if (!maxLevel) {
    return { success: false, error: isEn ? "Unknown skill" : "Kỹ năng không hợp lệ" };
  }
  const skills = (pet.skills as Record<string, number>) || {};
  const curLvl = skills[skillId] || 0;

  if (curLvl >= maxLevel) {
    return { success: false, error: isEn ? "Skill already at maximum level" : "Kỹ năng đã đạt cấp tối đa" };
  }

  const updatedSkills = { ...skills, [skillId]: curLvl + 1 };
  const updatedPoints = skillPoints - 1;

  const { error: updateErr } = await admin
    .from("user_pets")
    .update({ skills: updatedSkills, skill_points: updatedPoints })
    .eq("user_id", userId);

  if (updateErr) {
    return { success: false, error: isEn ? "Failed to update database" : "Lưu vào cơ sở dữ liệu thất bại" };
  }

  revalidatePath("/dashboard/pet");
  revalidatePath("/dashboard");
  return { success: true };
}

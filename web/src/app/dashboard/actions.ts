"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";
import { createAdminClient } from "../../lib/supabase/admin";
import { getDiscordIdentity } from "../../lib/discord";

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
  if (!userId) return { success: false, error: "Unauthorized" };

  const admin = createAdminClient();
  const { data: pet, error: petErr } = await admin
    .from("user_pets")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (petErr || !pet) {
    return { success: false, error: "Pet not found" };
  }

  const skillPoints = pet.skill_points || 0;
  if (skillPoints <= 0) {
    return { success: false, error: "No skill points available" };
  }

  const maxLevel = skillId === "double_gem" ? 2 : 3;
  const skills = (pet.skills as Record<string, number>) || {};
  const curLvl = skills[skillId] || 0;

  if (curLvl >= maxLevel) {
    return { success: false, error: "Skill already at maximum level" };
  }

  const updatedSkills = { ...skills, [skillId]: curLvl + 1 };
  const updatedPoints = skillPoints - 1;

  const { error: updateErr } = await admin
    .from("user_pets")
    .update({ skills: updatedSkills, skill_points: updatedPoints })
    .eq("user_id", userId);

  if (updateErr) {
    return { success: false, error: "Failed to update database" };
  }

  revalidatePath("/dashboard/pet");
  revalidatePath("/dashboard");
  return { success: true };
}

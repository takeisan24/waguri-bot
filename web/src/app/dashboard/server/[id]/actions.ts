"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

// Chỉ cho phép sửa vài key an toàn (toggle tính năng theo server).
const ALLOWED = new Set(["ai_enabled", "pvp", "police_jail", "gambling"]);

async function userManages(guildId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  // app_metadata: chỉ service-role ghi được (set ở auth/callback) -> không giả mạo được từ client.
  const guilds = (user.app_metadata?.guilds as { id: string; manage?: boolean }[] | undefined) ?? [];
  return guilds.some((g) => g.id === guildId && g.manage === true);
}

export async function setGuildFlag(guildId: string, key: string, value: string) {
  if (!ALLOWED.has(key)) return;
  if (value !== "0" && value !== "1") return;
  if (!(await userManages(guildId))) return; // gate quyền Quản lý Server
  const admin = createAdminClient();
  await admin.rpc("set_guild_setting", { p_guild: guildId, p_key: key, p_value: value });
  revalidatePath(`/dashboard/server/${guildId}`);
}

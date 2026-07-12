"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";
import { createAdminClient } from "../../lib/supabase/admin";
import { getDiscordIdentity } from "../../lib/discord";

export async function likeBakeryAction(ownerId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "unauthenticated" };
  }

  const { id } = getDiscordIdentity(user);
  if (!id) {
    return { success: false, error: "identity_error" };
  }

  if (id === ownerId) {
    return { success: false, error: "self_like" };
  }

  const admin = createAdminClient();
  const { data: res, error } = await admin.rpc("like_bakery", {
    p_liker_id: id,
    p_bakery_owner_id: ownerId,
  });

  if (error) {
    console.error("[LIKE BAKERY ACTION ERROR]", error);
    return { success: false, error: "db_error" };
  }

  if (res === "ok") {
    revalidatePath(`/tiem/${ownerId}`);
    return { success: true };
  }

  return { success: false, error: res };
}

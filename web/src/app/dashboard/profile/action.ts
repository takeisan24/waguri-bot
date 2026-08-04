"use server";

import { getDiscordIdentity } from "@/lib/discord";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ProfileFormValues, profileSchema } from "@/lib/validations/profile";
import { revalidatePath } from "next/cache";

export async function updateProfile(values: ProfileFormValues) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: "profile_edit.error_no_user" };
        }
        const { id } = getDiscordIdentity(user);
        if (!id) {
            return { success: false, error: "profile_edit.error_no_discord" };
        }

        const parsed = profileSchema.safeParse(values);
        if (!parsed.success) {
            const firstError = parsed.error.issues[0]?.message || "profile_edit.error_invalid";
            return { success: false, error: firstError };
        }

        const { bio } = parsed.data;

        const admin = createAdminClient();
        const { error: dbError } = await admin
            .from("users")
            .update({ bio: bio || "" })
            .eq("user_id", id);

        if (dbError) {
            console.error("[SERVER ACTION ERROR] Update profile failed:", dbError);
            return { success: false, error: "profile_edit.error_db" };
        }

        revalidatePath(`/u/${id}`);
        revalidatePath("/dashboard/profile");

        return { success: true, message: "profile_edit.success" };
    } catch (err) {
        console.error("[SERVER ACTION ERROR]:", err);
        return { success: false, error: "profile_edit.error_generic" };
    }
}

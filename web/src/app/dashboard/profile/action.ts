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
            return { success: false, error: "Mình không biết bạn là ai đâu trời... Hãy đăng nhập để mình biết bạn là ai nhen >.<" }
        };
        const { id } = getDiscordIdentity(user);
        if (!id) {
            return { success: false, error: "Mình không tìm thấy tài khoản Discord của bạn rùi >.<" }
        }

        const parsed = profileSchema.safeParse(values);
        if (!parsed.success) {
            const firstError = parsed.error.issues[0]?.message || "Thông tin tớ biết về cậu không hợp lệ thì phải!";
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
            return { success: false, error: "Tớ không thể nhớ được thông tin của cậu >.<" };
        }

        revalidatePath(`/u/${id}`);
        revalidatePath("/dashboard/profile");

        return { success: true, message: "Yay! Tớ đã ghi nhớ được thông tin từ cậu rồi! ✨" }
    } catch (err) {
        console.error("[SERVER ACTION ERROR]:", err);
        return { success: false, error: "Hình như là mình bị ốm rồi, cần đi bệnh viện kiểm tra xem sao >.<!" };
    }
}
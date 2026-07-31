import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../lib/discord";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Hồ sơ cá nhân 🌸 — Waguri",
    description: "Tùy chỉnh tiểu sử cá nhân và huy hiệu hiển thị của bạn.",
};

export default async function ProfilePage() {
    // 1. Auth Check: Đảm bảo User đã đăng nhập
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const { id, username } = getDiscordIdentity(user);
    if (!id) redirect("/login");

    // 2. Fetch dữ liệu Bio hiện tại từ PostgreSQL
    const admin = createAdminClient();
    const { data: userData } = await admin
        .from("users")
        .select("bio")
        .eq("user_id", id)
        .maybeSingle();

    const currentBio = userData?.bio || "";

    return (
        <div className="container max-w-4xl py-8 px-4 space-y-8">
            {/* Header tiêu đề trang */}
            <div className="space-y-2">
                <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
                    <span>🌸</span> Hồ Sơ Cá Nhân
                </h1>
                <p className="text-slate-400 text-sm">
                    Xin chào <span className="text-pink-300 font-semibold">@{username}</span>! Hãy trang trí hồ sơ của cậu để mọi người hiểu hơn về cậu nhé~
                </p>
            </div>

            {/* Ráp Client Component Form vào đây */}
            <ProfileForm initialBio={currentBio} />
        </div>
    );
}

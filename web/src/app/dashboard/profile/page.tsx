import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../lib/discord";
import { getLocaleServer, t } from "../../../lib/i18n";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
    const locale = await getLocaleServer();
    return {
        title: t("profile_edit.meta_title", locale),
        description: t("profile_edit.greeting", locale, { username: "you" }),
    };
}

export default async function ProfilePage() {
    const locale = await getLocaleServer();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const { id, username } = getDiscordIdentity(user);
    if (!id) redirect("/login");

    const admin = createAdminClient();
    const { data: userData } = await admin
        .from("users")
        .select("bio")
        .eq("user_id", id)
        .maybeSingle();

    const currentBio = userData?.bio || "";

    return (
        <div className="min-h-screen bg-[#0d0812] text-slate-200">
            <div className="container mx-auto max-w-4xl py-8 px-4 space-y-8">
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1 text-sm text-pink-300 hover:underline"
                >
                    {t("profile_edit.back_dashboard", locale)}
                </Link>

                <div className="space-y-2">
                    <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
                        <span>🌸</span> {t("profile_edit.heading", locale)}
                    </h1>
                    <p className="text-slate-400 text-sm">
                        {t("profile_edit.greeting", locale, { username })}
                    </p>
                </div>

                <ProfileForm initialBio={currentBio} />
            </div>
        </div>
    );
}

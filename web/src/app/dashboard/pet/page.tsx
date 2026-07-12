import React from "react";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../lib/discord";
import { findPetSpecies } from "../../../lib/game";
import { getLocaleServer, t } from "../../../lib/i18n";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import CherryBlossom from "../../../components/CherryBlossom";
import PetSkillTree from "../../../components/PetSkillTree";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getLocaleServer();
  return {
    title: locale.startsWith("en") ? "Pet Passive Skill Tree ⚡ — Waguri" : "Cây kỹ năng thú cưng ⚡ — Waguri",
    robots: { index: false }
  };
}

export default async function PetDashboardPage() {
  const locale = await getLocaleServer();
  const isEn = locale.startsWith("en");
  
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = getDiscordIdentity(user);
  if (!id) redirect("/login");

  const admin = createAdminClient();
  const { data: pet } = await admin
    .from("user_pets")
    .select("*")
    .eq("user_id", id)
    .maybeSingle();

  const species = pet ? findPetSpecies(pet.species || "", locale) : null;

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200 overflow-x-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-pink-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[70%] rounded-full bg-purple-600/10 blur-[130px]" />
      </div>
      <CherryBlossom />

      <SiteHeader />

      <main className="relative flex-1 w-full max-w-3xl mx-auto px-6 py-8 z-10 space-y-6">
        {!pet ? (
          <div className="glass-panel rounded-3xl p-10 text-center space-y-4 border border-pink-300/20">
            <h1 className="text-2xl font-extrabold text-white">
              {isEn ? "No Pet Found 🐾" : "Chưa có thú cưng 🐾"}
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto">
              {isEn
                ? "You don't have a pet yet! Join Discord and use `/pet adopt` to adopt your first cute pet."
                : "Cậu chưa có thú cưng nào đồng hành cả! Hãy mở Discord lên và dùng lệnh `/pet adopt` để nhận nuôi một người bạn nhỏ đáng yêu nhé."}
            </p>
            <div className="pt-2">
              <a
                href="https://discord.com/oauth2/authorize?client_id=1482620714690543738&permissions=1099512007760&integration_type=0&scope=bot+applications.commands"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-7 py-3 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 transition-all"
              >
                {t("profile.invite_btn", locale)}
              </a>
            </div>
          </div>
        ) : (
          <PetSkillTree pet={pet} species={species} isEn={isEn} />
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

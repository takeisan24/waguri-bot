import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { setGuildFlag } from "./actions";
import { getLocaleServer, t } from "../../../../lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getLocaleServer();
  return {
    title: `${t("server_config.page_title", locale)}`,
    robots: { index: false },
  };
}

function Toggle({
  label,
  desc,
  on,
  action,
  locale,
}: {
  label: string;
  desc: string;
  on: boolean;
  action: () => Promise<void>;
  locale: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-slate-800 pt-4 first:border-0 first:pt-0">
      <div>
        <p className="text-sm font-semibold text-white">
          {label}{" "}
          {on ? (
            <span className="text-emerald-400">{t("server_config.toggle_on", locale)}</span>
          ) : (
            <span className="text-rose-400">{t("server_config.toggle_off", locale)}</span>
          )}
        </p>
        <p className="text-xs text-slate-400">{desc}</p>
      </div>
      <form action={action}>
        <button className="px-4 py-2 rounded-full text-xs font-bold border border-pink-300/30 text-pink-200 hover:border-pink-300/60 transition-all whitespace-nowrap">
          {on ? t("server_config.btn_off", locale) : t("server_config.btn_on", locale)}
        </button>
      </form>
    </div>
  );
}

export default async function ServerConfig({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocaleServer();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const guilds = (user.user_metadata?.guilds as { id: string; name: string; manage?: boolean }[] | undefined) ?? [];
  const guild = guilds.find((g) => g.id === id);
  if (!guild || !guild.manage) redirect("/dashboard");

  const admin = createAdminClient();
  const { data } = await admin.from("guild_settings").select("settings").eq("guild_id", id).single();
  const s = (data?.settings as Record<string, string>) || {};
  const aiOn = s.ai_enabled !== "0";
  const pvpOn = s.pvp !== "0";
  const jailOn = s.police_jail !== "0";
  const gambleOn = s.gambling !== "0";

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200">
      <header className="w-full max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="text-xl font-black text-glow tracking-wider text-pink-300">
          WAGURI <span className="text-pink-400">🌸</span>
        </Link>
        <Link href="/dashboard" className="text-xs font-bold text-slate-400 hover:text-pink-300">
          ← Dashboard
        </Link>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white">{t("server_config.header_title", locale)}</h1>
          <p className="text-pink-300 text-sm mt-1">🏰 {guild.name}</p>
          <p className="text-xs text-slate-500 mt-1">
            {t("server_config.subtitle", locale)}
          </p>
        </div>

        <div className="glass-panel rounded-3xl p-6 space-y-4 border border-pink-300/10">
          <Toggle
            label={t("server_config.ai_label", locale)}
            desc={t("server_config.ai_desc", locale)}
            on={aiOn}
            action={setGuildFlag.bind(null, id, "ai_enabled", aiOn ? "0" : "1")}
            locale={locale}
          />
          <Toggle
            label={t("server_config.pvp_label", locale)}
            desc={t("server_config.pvp_desc", locale)}
            on={pvpOn}
            action={setGuildFlag.bind(null, id, "pvp", pvpOn ? "0" : "1")}
            locale={locale}
          />
          <Toggle
            label={t("server_config.gamble_label", locale)}
            desc={t("server_config.gamble_desc", locale)}
            on={gambleOn}
            action={setGuildFlag.bind(null, id, "gambling", gambleOn ? "0" : "1")}
            locale={locale}
          />
          <Toggle
            label={t("server_config.jail_label", locale)}
            desc={t("server_config.jail_desc", locale)}
            on={jailOn}
            action={setGuildFlag.bind(null, id, "police_jail", jailOn ? "0" : "1")}
            locale={locale}
          />
        </div>

        <p className="text-xs text-slate-500">
          {t("server_config.tip", locale)}
        </p>
      </main>
    </div>
  );
}

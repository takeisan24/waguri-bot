import React from "react";
import CherryBlossom from "../../components/CherryBlossom";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import CommandsExplorer from "../../components/CommandsExplorer";
import { getLocaleServer, t } from "../../lib/i18n";

export async function generateMetadata() {
  const locale = await getLocaleServer();
  return {
    title: t("commands.meta_title", locale),
    description: t("commands.meta_desc", locale),
  };
}

export default async function CommandsPage() {
  const locale = await getLocaleServer();
  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200 overflow-x-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-pink-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[70%] rounded-full bg-purple-600/10 blur-[130px]" />
      </div>
      <CherryBlossom />
      <SiteHeader />

      <main className="relative flex-1 w-full max-w-4xl mx-auto px-6 py-8 z-10 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl md:text-4xl font-black text-white">📜 {t("commands.title", locale)}</h1>
          <p className="text-slate-400 text-sm">
            {t("commands.subtitle", locale)}
          </p>
        </div>
        <CommandsExplorer />
      </main>

      <SiteFooter />
    </div>
  );
}

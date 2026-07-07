import React from "react";
import { notFound } from "next/navigation";
import CherryBlossom from "../../../components/CherryBlossom";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import { BOT_API } from "../../../lib/botApi";
import { affectionTier } from "../../../lib/game";
import { getLocaleServer, t } from "../../../lib/i18n";

const API = BOT_API;
const INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1482620714690543738&permissions=1099512007760&integration_type=0&scope=bot+applications.commands";

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");

type Profile = {
  id: string;
  username: string;
  avatar: string | null;
  hidden?: boolean;
  level: number;
  expInto: number;
  expForNext: number;
  wallet: number;
  bank: number;
  netWorth: number;
  job: string | null;
  affection: number;
  affectionTier: string | null;
  partner: string | null;
  clan: string | null;
  title: string | null;
  color: string | null;
  achievements: number;
  rank: number;
};

async function getProfile(id: string): Promise<Profile | { hidden: true } | "notfound" | null> {
  try {
    const res = await fetch(`${API}/api/profile/${id}`, { next: { revalidate: 60 } });
    if (res.status === 404) return "notfound";
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocaleServer();
  const p = await getProfile(id);
  const name = p && p !== "notfound" && !("hidden" in p) ? (p as Profile).username : t("profile.default_user", locale);
  return {
    title: t("profile.meta_title", locale, { name }),
    description: t("profile.meta_desc", locale, { name }),
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel rounded-2xl px-5 py-4 flex flex-col gap-1">
      <span className="text-xs text-pink-300/80 tracking-wide">{label}</span>
      <span className="text-lg font-bold text-white">{value}</span>
    </div>
  );
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocaleServer();
  const p = await getProfile(id);
  if (p === "notfound") notFound();

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200 overflow-x-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-pink-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[70%] rounded-full bg-purple-600/10 blur-[130px]" />
      </div>
      <CherryBlossom />

      <SiteHeader />

      <main className="relative flex-1 w-full max-w-3xl mx-auto px-6 py-8 z-10">
        {!p || (p && "hidden" in p && p.hidden) ? (
          <div className="glass-panel rounded-3xl p-10 text-center space-y-4">
            <h1 className="text-2xl font-extrabold text-white">
              {!p ? t("profile.not_found", locale) : t("profile.hidden", locale)}
            </h1>
            <p className="text-slate-400 text-sm">
              {!p
                ? t("profile.not_found_desc", locale)
                : t("profile.hidden_desc", locale)}
            </p>
            <a
              href={INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-7 py-3 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 transition-all"
            >
              {t("profile.invite_btn", locale)}
            </a>
          </div>
        ) : (
          (() => {
            const prof = p as Profile;
            const expPct = prof.expForNext > 0 ? Math.min((prof.expInto / prof.expForNext) * 100, 100) : 0;
            return (
              <div className="space-y-6">
                {/* Header card */}
                <div className="glass-panel rounded-3xl p-8 flex flex-col sm:flex-row items-center gap-6 border border-pink-300/20">
                  {prof.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={prof.avatar}
                      alt={prof.username}
                      width={96}
                      height={96}
                      className="rounded-full border-2 border-pink-300/40"
                    />
                  ) : null}
                  <div className="flex-1 text-center sm:text-left">
                    {prof.title ? (
                      <p className="text-xs font-semibold mb-0.5" style={prof.color ? { color: prof.color } : undefined}>
                        🏷️ {prof.title}
                      </p>
                    ) : null}
                    <h1 className="text-2xl md:text-3xl font-black text-white" style={prof.color ? { color: prof.color } : undefined}>
                      {prof.username}
                    </h1>
                    <p className="text-pink-300 text-sm mt-1">
                      {prof.job || t("profile.default_job", locale)} · Lv.{prof.level}
                      {prof.clan ? ` · 🏰 ${prof.clan}` : ""}
                    </p>
                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>EXP</span>
                        <span>
                          {fmt(prof.expInto)}/{fmt(prof.expForNext)}
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-[#1c1424] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-pink-400 to-purple-400"
                          style={{ width: `${expPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Stat label={t("profile.stat_total_wealth", locale)} value={`${fmt(prof.netWorth)} VNĐ`} />
                  <Stat label={t("profile.stat_rank", locale)} value={`#${prof.rank}`} />
                  <Stat label={t("profile.stat_wallet", locale)} value={`${fmt(prof.wallet)} VNĐ`} />
                  <Stat label={t("profile.stat_bank", locale)} value={`${fmt(prof.bank)} VNĐ`} />
                  <Stat label={t("profile.stat_affection", locale)} value={affectionTier(prof.affection, locale)} />
                  <Stat label={t("profile.stat_achievements", locale)} value={`${prof.achievements}`} />
                  {prof.partner ? <Stat label={t("profile.stat_beloved", locale)} value={prof.partner} /> : null}
                </div>

                {/* CTA */}
                <div className="glass-panel rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 border border-pink-300/20">
                  <p className="text-slate-300 text-sm text-center sm:text-left">
                    {t("profile.cta_text", locale)}
                  </p>
                  <a
                    href={INVITE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 px-7 py-3 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 transition-all"
                  >
                    {t("profile.cta_btn", locale)}
                  </a>
                </div>
              </div>
            );
          })()
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

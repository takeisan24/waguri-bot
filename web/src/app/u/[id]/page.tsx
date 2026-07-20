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
  prestige?: number;
  badges?: Array<{ badge_id: string; is_equipped: boolean; slot_index: number }>;
};

const BADGES: Record<string, { emoji: string; name_vi: string; name_en: string }> = {
  rich: { emoji: '💰', name_vi: 'Triệu Phú Gekka', name_en: 'Gekka Millionaire' },
  heart: { emoji: '💖', name_vi: 'Trái Tim Ấm Áp', name_en: 'Warm Heart' },
  vip: { emoji: '👑', name_vi: 'Thành Viên Hoàng Gia', name_en: 'Royal Member' },
  baker: { emoji: '🍰', name_vi: 'Vua Bánh Gekka', name_en: 'Gekka Bakery King' },
  prestige_1: { emoji: '⭐', name_vi: 'Chuyển Sinh I', name_en: 'Prestige I' },
  prestige_2: { emoji: '🌟', name_vi: 'Chuyển Sinh II', name_en: 'Prestige II' },
  prestige_3: { emoji: '✨', name_vi: 'Chuyển Sinh III', name_en: 'Prestige III' }
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

  const isEn = locale.startsWith("en");

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
                    <div className="relative group flex-shrink-0">
                      {prof.prestige && prof.prestige > 0 ? (
                        <div className={`absolute -inset-1 rounded-full blur-sm opacity-80 group-hover:opacity-100 transition-opacity animate-pulse bg-gradient-to-r ${
                          prof.prestige === 1 ? 'from-amber-400 to-yellow-500' :
                          prof.prestige === 2 ? 'from-cyan-400 via-pink-500 to-purple-600' :
                          'from-red-500 via-yellow-500 via-green-500 via-blue-500 to-purple-500 bg-[length:400%_400%]'
                        }`} />
                      ) : null}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={prof.avatar}
                        alt={prof.username}
                        width={96}
                        height={96}
                        className="relative rounded-full border-2 border-pink-300/40 bg-[#0d0812] z-10"
                      />
                    </div>
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
                      {prof.prestige && prof.prestige > 0 ? ` · 🌟 CS ${prof.prestige}` : ""}
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

                {/* Badge Showcase */}
                <div className="glass-panel rounded-3xl p-6 border border-pink-300/10">
                  <h3 className="text-sm font-bold text-pink-300/90 mb-4 flex items-center gap-2">
                    🎖️ {isEn ? "Badges Showcase" : "Hộp Trưng Bày Huy Hiệu"}
                  </h3>
                  <div className="grid grid-cols-6 gap-3">
                    {Array.from({ length: 6 }).map((_, idx) => {
                      const slotNum = idx + 1;
                      const equipped = (prof.badges || []).find(b => b.is_equipped && b.slot_index === slotNum);
                      const badgeConf = equipped ? BADGES[equipped.badge_id] : null;

                      return (
                        <div
                          key={slotNum}
                          className="relative aspect-square rounded-2xl border border-dashed border-pink-300/10 bg-pink-500/5 flex items-center justify-center group/badge cursor-pointer hover:border-pink-300/30 hover:bg-pink-500/10 transition-all"
                        >
                          {badgeConf ? (
                            <>
                              <span className="text-3xl filter drop-shadow-[0_2px_8px_rgba(236,72,153,0.3)] animate-[bounce_3s_infinite_ease-in-out]">
                                {badgeConf.emoji}
                              </span>
                              <div className="absolute bottom-full mb-2 hidden group-hover/badge:flex flex-col items-center z-20">
                                <div className="bg-[#120a1c] border border-pink-300/20 text-white text-xs font-semibold py-1.5 px-3 rounded-xl shadow-xl whitespace-nowrap">
                                  {isEn ? badgeConf.name_en : badgeConf.name_vi}
                                </div>
                                <div className="w-2.5 h-2.5 bg-[#120a1c] border-r border-b border-pink-300/20 transform rotate-45 -mt-1.5" />
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-slate-600/70 font-semibold">{slotNum}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Stat label={t("profile.stat_total_wealth", locale)} value={`${fmt(prof.netWorth)} ${t("common.currency", locale)}`} />
                  <Stat label={t("profile.stat_rank", locale)} value={`#${prof.rank}`} />
                  <Stat label={t("profile.stat_wallet", locale)} value={`${fmt(prof.wallet)} ${t("common.currency", locale)}`} />
                  <Stat label={t("profile.stat_bank", locale)} value={`${fmt(prof.bank)} ${t("common.currency", locale)}`} />
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

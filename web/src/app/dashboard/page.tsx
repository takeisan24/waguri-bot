import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { createAdminClient } from "../../lib/supabase/admin";
import { getDiscordIdentity } from "../../lib/discord";
import { getLevelProgress, affectionTier, fmtVND, getCurrentSeasonId, getSeasonLabel, findPetSpecies, getPetLevelProgress } from "../../lib/game";
import { toggleProfilePublic, toggleVoteReminder } from "./actions";
import ShareProfileButton from "../../components/ShareProfileButton";
import EventBanner from "../../components/EventBanner";
import { getLocaleServer, t } from "../../lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getLocaleServer();
  return {
    title: t("dashboard.meta_title", locale),
    robots: { index: false }
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel rounded-2xl px-5 py-4 flex flex-col gap-1 border border-pink-300/10">
      <span className="text-xs text-pink-300/80">{label}</span>
      <span className="text-lg font-bold text-white">{value}</span>
    </div>
  );
}

export default async function Dashboard() {
  const locale = await getLocaleServer();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id, username, avatar } = getDiscordIdentity(user);
  if (!id) redirect("/login");

  const guilds =
    (user.app_metadata?.guilds as { id: string; name: string; icon: string | null; manage?: boolean }[] | undefined) ?? [];
  const manageGuilds = guilds.filter((g) => g.manage);

  const admin = createAdminClient();
  const { data: row } = await admin.from("users").select("*").eq("user_id", id).single();

  let jobName: string | null = null;
  let clanName: string | null = null;
  let achievements = 0;
  if (row?.job_id) {
    const { data } = await admin.from("jobs").select("name").eq("id", row.job_id).single();
    jobName = data?.name ?? null;
  }
  if (row?.clan_id) {
    const { data } = await admin.from("clans").select("name").eq("id", row.clan_id).single();
    clanName = data?.name ?? null;
  }
  {
    const { count } = await admin
      .from("achievements")
      .select("*", { count: "exact", head: true })
      .eq("user_id", id);
    achievements = count ?? 0;
  }

  // Sức khỏe & năng lượng
  const health = Math.max(0, Math.min(100, Number(row?.health ?? 100)));
  const ENERGY_MAX = 100;
  const storedEnergy = Number(row?.energy ?? ENERGY_MAX);
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const eUpdatedAt = row?.energy_updated_at ? new Date(row.energy_updated_at).getTime() : nowMs;
  const energy = Math.max(0, Math.min(ENERGY_MAX, storedEnergy + Math.floor((nowMs - eUpdatedAt) / 60000)));

  // Trạng thái nông trại / thú cưng
  type PigRow = { stage?: string; tier?: number; sick?: boolean };
  type PlantRow = { stage?: string; type?: string };
  type PetRow = { name?: string; species?: string; exp?: number };
  let pig: PigRow | null = null;
  let plant: PlantRow | null = null;
  let pet: PetRow | null = null;
  if (row) {
    const [pg, pl, pt] = await Promise.all([
      admin.from("pigs").select("*").eq("user_id", id).maybeSingle(),
      admin.from("plants").select("*").eq("user_id", id).maybeSingle(),
      admin.from("user_pets").select("*").eq("user_id", id).maybeSingle(),
    ]);
    pig = (pg.data as unknown as PigRow) ?? null;
    plant = (pl.data as unknown as PlantRow) ?? null;
    pet = (pt.data as unknown as PetRow) ?? null;
  }

  const seasonId = getCurrentSeasonId();
  const seasonLabel = getSeasonLabel(seasonId, locale);
  const { data: bp } = await admin
    .from("battle_pass_users")
    .select("*")
    .eq("user_id", id)
    .eq("season_id", seasonId)
    .maybeSingle();

  const bpXp = bp?.xp ?? 0;
  const bpLevel = Math.floor(bpXp / 1000);
  const bpXpIntoLevel = bpXp % 1000;
  const bpXpPct = Math.min(Math.floor((bpXpIntoLevel / 1000) * 100), 100);
  const isPassPremium = bp?.is_premium ?? false;

  const prog = getLevelProgress(Number(row?.exp || 0));
  const wallet = Number(row?.wallet || 0);
  const bank = Number(row?.bank || 0);
  const isPublic = row?.profile_public !== false;
  const voteReminder = row?.vote_reminder !== false;
  const isPremium = row?.premium_until && new Date(row.premium_until).getTime() > nowMs;
  const voteStreak = Number(row?.vote_streak || 0);
  const expPct = prog.expForNextLevel > 0 ? Math.min((prog.expIntoLevel / prog.expForNextLevel) * 100, 100) : 0;

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200">
      <header className="relative w-full max-w-4xl mx-auto px-6 py-5 flex items-center justify-between z-20">
        <Link href="/" className="text-xl font-black text-glow tracking-wider text-pink-300">
          WAGURI <span className="text-pink-400">🌸</span>
        </Link>
        <form action="/auth/signout" method="post">
          <button className="text-xs font-bold text-slate-400 hover:text-pink-300">{t("dashboard.logout", locale)}</button>
        </form>
      </header>

      <main className="relative flex-1 w-full max-w-4xl mx-auto px-6 py-6 z-10 space-y-6">
        <EventBanner />
        {/* Header user */}
        <div className="glass-panel rounded-3xl p-7 flex flex-col sm:flex-row items-center gap-5 border border-pink-300/20">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt={username} width={80} height={80} className="rounded-full border-2 border-pink-300/40" />
          ) : null}
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl font-black text-white">
              {username} {isPremium ? "💎" : ""}
            </h1>
            <p className="text-pink-300 text-sm mt-1">
              {jobName || t("dashboard.default_job", locale)} · Lv.{prog.level}
              {clanName ? ` · 🏰 ${clanName}` : ""}
            </p>
            <div className="mt-3">
              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                <span>EXP</span>
                <span>
                  {fmtVND(prog.expIntoLevel)}/{fmtVND(prog.expForNextLevel)}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-[#1c1424] overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-pink-400 to-purple-400" style={{ width: `${expPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Premium upsell / trạng thái */}
        <Link
          href="/dashboard/premium"
          className="block glass-panel rounded-3xl p-5 border border-pink-400/30 hover:border-pink-400/60 transition-all"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-extrabold text-white">
                {isPremium ? t("dashboard.premium_active", locale) : t("dashboard.premium_upgrade", locale)}
              </p>
              <p className="text-xs text-pink-200/80 mt-0.5">
                {isPremium
                  ? t("dashboard.premium_active_desc", locale)
                  : t("dashboard.premium_upgrade_desc", locale)}
              </p>
            </div>
            <span className="text-pink-300 font-bold text-sm flex-shrink-0">
              {isPremium ? t("dashboard.premium_renew_btn", locale) : t("dashboard.premium_view_btn", locale)}
            </span>
          </div>
        </Link>

        {!row ? (
          <div className="glass-panel rounded-3xl p-8 text-center text-slate-400">
            {t("dashboard.no_data", locale)}
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat label={t("dashboard.stat_total_wealth", locale)} value={`${fmtVND(wallet + bank)} VNĐ`} />
              <Stat label={t("dashboard.stat_wallet", locale)} value={`${fmtVND(wallet)} VNĐ`} />
              <Stat label={t("dashboard.stat_bank", locale)} value={`${fmtVND(bank)} VNĐ`} />
              <Stat label={t("dashboard.stat_affection", locale)} value={affectionTier(Number(row.affection || 0), locale)} />
              <Stat label={t("dashboard.stat_achievements", locale)} value={`${achievements}`} />
              <Stat label={t("dashboard.stat_vote_streak", locale)} value={t("dashboard.days", locale, { count: voteStreak })} />
            </div>

            {/* Sức khỏe & năng lượng */}
            <div className="glass-panel rounded-3xl p-6 space-y-4 border border-pink-300/10">
              <h2 className="text-lg font-extrabold text-white">{t("dashboard.health_energy_title", locale)}</h2>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>{t("dashboard.health_label", locale)}</span>
                    <span>{health}/100</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#1c1424] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-pink-400" style={{ width: `${health}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>{t("dashboard.energy_label", locale)}</span>
                    <span>{energy}/{ENERGY_MAX}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#1c1424] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-yellow-400" style={{ width: `${(energy / ENERGY_MAX) * 100}%` }} />
                  </div>
                </div>
              </div>
              {health < 30 ? (
                <p className="text-xs text-rose-300">{t("dashboard.health_low_warning", locale)}</p>
              ) : null}
            </div>

            {/* Thiện cảm với Waguri */}
            <div className="glass-panel rounded-3xl p-6 space-y-4 border border-pink-300/10 bg-gradient-to-br from-pink-500/5 to-purple-500/5">
              <h2 className="text-lg font-extrabold text-white flex items-center gap-1.5">{t("dashboard.affection_title", locale)}</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-400 font-medium">{t("dashboard.relationship_tier", locale)}</span>
                  <span className="text-sm font-extrabold text-pink-300">{affectionTier(row?.affection ?? 0, locale)}</span>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>{t("dashboard.affection_points", locale)}</span>
                    <span>{t("dashboard.points_suffix", locale, { count: row?.affection ?? 0 })}</span>
                  </div>
                  {(() => {
                    const aff = Number(row?.affection ?? 0);
                    const tiers = [0, 15, 50, 120, 300];
                    const next = tiers.find(t => t > aff) || 300;
                    const pct = Math.min(Math.floor((aff / next) * 100), 100);
                    return (
                      <div className="h-2.5 rounded-full bg-[#1c1424] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-pink-400 to-rose-500" style={{ width: `${pct}%` }} />
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Sổ Sứ Mệnh */}
            <div className="glass-panel rounded-3xl p-6 space-y-4 border border-pink-300/10">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-extrabold text-white flex items-center gap-1.5">{t("dashboard.bp_title", locale)}</h2>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isPassPremium ? "bg-amber-400/20 text-amber-300 border border-amber-400/30" : "bg-slate-400/15 text-slate-300"}`}>
                  {isPassPremium ? t("dashboard.bp_premium", locale) : t("dashboard.bp_free", locale)}
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-400 font-medium">{seasonLabel}</span>
                  <span className="text-sm font-extrabold text-pink-300">{t("dashboard.bp_level_label", locale, { level: bpLevel })}</span>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>{t("dashboard.bp_progress_label", locale)}</span>
                    <span>{bpXpIntoLevel.toLocaleString("vi-VN")}/1,000 XP ({bpXpPct}%)</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#1c1424] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-pink-400 to-purple-500" style={{ width: `${bpXpPct}%` }} />
                  </div>
                </div>
              </div>
              <Link
                href="/dashboard/pass"
                className="mt-2 block w-full text-center text-xs py-2.5 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-300 font-bold hover:bg-pink-500/15 transition-all"
              >
                {t("dashboard.bp_details_btn", locale)}
              </Link>
            </div>

            {/* Nông trại & thú cưng */}
            <div className="glass-panel rounded-3xl p-6 space-y-3 border border-pink-300/10">
              <h2 className="text-lg font-extrabold text-white">{t("dashboard.farm_pets_title", locale)}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-pink-500/5 px-4 py-3">
                  <p className="text-xs text-pink-300/80">{t("dashboard.pig_label", locale)}</p>
                  <p className="text-white font-semibold">{pig ? (pig.sick ? t("dashboard.pig_sick", locale) : t("dashboard.pig_stage", locale, { stage: pig.stage ?? "" })) : t("dashboard.pig_none", locale)}</p>
                </div>
                <div className="rounded-2xl bg-pink-500/5 px-4 py-3">
                  <p className="text-xs text-pink-300/80">{t("dashboard.plant_label", locale)}</p>
                  <p className="text-white font-semibold">{plant ? t("dashboard.plant_stage", locale, { stage: plant.stage ?? "" }) : t("dashboard.plant_none", locale)}</p>
                </div>
                
                <div className="rounded-2xl bg-pink-500/5 px-4 py-4 sm:col-span-2 flex flex-col gap-2">
                  <p className="text-xs text-pink-300/80">{t("dashboard.pet_label", locale)}</p>
                  {pet ? (() => {
                    const sp = findPetSpecies(pet.species || "", locale);
                    const { level, expIntoLevel, expForNextLevel } = getPetLevelProgress(pet.exp || 0);
                    const pct = expForNextLevel > 0 ? Math.min((expIntoLevel / expForNextLevel) * 100, 100) : 0;
                    const activeSkills = sp?.skills.filter(s => level >= s.lvl) || [];

                    return (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{sp?.emoji || "🐾"}</span>
                          <div>
                            <p className="text-white font-bold text-base">{pet.name || sp?.name} <span className="text-xs text-pink-300 font-normal bg-pink-500/10 px-2 py-0.5 rounded-full ml-1">{t("dashboard.pet_level", locale, { level })}</span></p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{expIntoLevel}/{expForNextLevel} EXP ({Math.round(pct)}%)</p>
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-[#1c1424] overflow-hidden">
                          <div className="h-full bg-pink-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        {activeSkills.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-800/60 space-y-1">
                            <p className="text-xs text-pink-300 font-bold">{t("dashboard.pet_skills_active", locale)}</p>
                            {activeSkills.map((sk, idx) => (
                              <p key={idx} className="text-xs text-slate-300 leading-relaxed">• {sk.desc}</p>
                            ))}
                          </div>
                        )}
                        <div className="flex justify-end mt-2 pt-2 border-t border-slate-800/60">
                          <Link
                            href="/dashboard/pet"
                            className="inline-block px-3 py-1.5 rounded-full text-[10px] font-extrabold bg-pink-300 text-[#0d0812] hover:bg-pink-400 transition-all uppercase tracking-wider"
                          >
                            ⚡ {locale.startsWith("en") ? "Skill Tree" : "Cây kỹ năng"}
                          </Link>
                        </div>
                      </div>
                    );
                  })() : (
                    <p className="text-white font-semibold">{t("dashboard.pet_none", locale)}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Settings */}
            <div className="glass-panel rounded-3xl p-6 space-y-4 border border-pink-300/10">
              <h2 className="text-lg font-extrabold text-white">{t("dashboard.settings_title", locale)}</h2>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">{t("dashboard.settings_profile_public", locale)}</p>
                  <p className="text-xs text-slate-400">
                    {isPublic ? (
                      <>
                        {t("dashboard.settings_profile_public_desc", locale)}{" "}
                        <Link href={`/u/${id}`} className="text-pink-300 hover:underline">
                          waguri-bot.vercel.app/u/{id}
                        </Link>
                      </>
                    ) : (
                      t("dashboard.settings_profile_private_desc", locale)
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isPublic ? <ShareProfileButton id={id} /> : null}
                  <form action={toggleProfilePublic}>
                    <button className="px-4 py-2 rounded-full text-xs font-bold border border-pink-300/30 text-pink-200 hover:border-pink-300/60 transition-all whitespace-nowrap">
                      {isPublic ? t("dashboard.settings_profile_hide_btn", locale) : t("dashboard.settings_profile_show_btn", locale)}
                    </button>
                  </form>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-slate-800 pt-4">
                <div>
                  <p className="text-sm font-semibold text-white">{t("dashboard.settings_vote_reminder", locale)}</p>
                  <p className="text-xs text-slate-400">
                    {voteReminder ? t("dashboard.settings_vote_reminder_on", locale) : t("dashboard.settings_vote_reminder_off", locale)}
                  </p>
                </div>
                <form action={toggleVoteReminder}>
                  <button className="px-4 py-2 rounded-full text-xs font-bold border border-pink-300/30 text-pink-200 hover:border-pink-300/60 transition-all whitespace-nowrap">
                    {voteReminder ? t("dashboard.settings_vote_reminder_off_btn", locale) : t("dashboard.settings_vote_reminder_on_btn", locale)}
                  </button>
                </form>
              </div>
            </div>
          </>
        )}

        {manageGuilds.length > 0 ? (
          <div className="glass-panel rounded-3xl p-6 space-y-3 border border-pink-300/10">
            <h2 className="text-lg font-extrabold text-white">{t("dashboard.manage_servers_title", locale)}</h2>
            <p className="text-xs text-slate-400">{t("dashboard.manage_servers_desc", locale)}</p>
            <div className="flex flex-wrap gap-2">
              {manageGuilds.map((g) => (
                <Link
                  key={g.id}
                  href={`/dashboard/server/${g.id}`}
                  className="px-4 py-2 rounded-full text-xs font-bold border border-pink-300/30 text-pink-100 hover:border-pink-300/60 bg-pink-500/5 transition-all"
                >
                  ⚙️ {g.name}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {guilds.length > 0 ? (
          <div className="glass-panel rounded-3xl p-6 space-y-3 border border-pink-300/10">
            <h2 className="text-lg font-extrabold text-white">{t("dashboard.server_leaderboards_title", locale)}</h2>
            <p className="text-xs text-slate-400">{t("dashboard.server_leaderboards_desc", locale)}</p>
            <div className="flex flex-wrap gap-2">
              {guilds.map((g) => (
                <Link
                  key={g.id}
                  href={`/leaderboard?guild=${g.id}&name=${encodeURIComponent(g.name)}`}
                  className="px-4 py-2 rounded-full text-xs font-bold border border-pink-300/20 text-pink-100 hover:border-pink-300/50 bg-pink-500/5 transition-all"
                >
                  {g.name}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <div className="text-center">
          <Link href="/leaderboard" className="text-sm text-pink-300 hover:underline">
            {t("dashboard.global_leaderboard_link", locale)}
          </Link>
        </div>
      </main>
    </div>
  );
}

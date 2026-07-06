import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { createAdminClient } from "../../lib/supabase/admin";
import { getDiscordIdentity } from "../../lib/discord";
import { getLevelProgress, affectionTier, fmtVND, getCurrentSeasonId, getSeasonLabel } from "../../lib/game";
import { toggleProfilePublic, toggleVoteReminder } from "./actions";
import ShareProfileButton from "../../components/ShareProfileButton";
import EventBanner from "../../components/EventBanner";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bảng điều khiển — Waguri 🌸", robots: { index: false } };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel rounded-2xl px-5 py-4 flex flex-col gap-1 border border-pink-300/10">
      <span className="text-xs text-pink-300/80">{label}</span>
      <span className="text-lg font-bold text-white">{value}</span>
    </div>
  );
}

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id, username, avatar } = getDiscordIdentity(user);
  if (!id) redirect("/login");

  const guilds =
    (user.user_metadata?.guilds as { id: string; name: string; icon: string | null; manage?: boolean }[] | undefined) ?? [];
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

  // Sức khỏe & năng lượng (năng lượng hồi 1/phút -> tính lại từ mốc lưu, khỏi ghi DB).
  const health = Math.max(0, Math.min(100, Number(row?.health ?? 100)));
  const ENERGY_MAX = 100;
  const storedEnergy = Number(row?.energy ?? ENERGY_MAX);
  // eslint-disable-next-line react-hooks/purity -- server component (force-dynamic): render 1 lần/request nên Date.now() an toàn
  const nowMs = Date.now();
  const eUpdatedAt = row?.energy_updated_at ? new Date(row.energy_updated_at).getTime() : nowMs;
  const energy = Math.max(0, Math.min(ENERGY_MAX, storedEnergy + Math.floor((nowMs - eUpdatedAt) / 60000)));

  // Trạng thái nông trại / thú cưng (hiển thị thêm cho đúng thông tin user mong).
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
      admin.from("pets").select("*").eq("user_id", id).maybeSingle(),
    ]);
    pig = (pg.data as unknown as PigRow) ?? null;
    plant = (pl.data as unknown as PlantRow) ?? null;
    pet = (pt.data as unknown as PetRow) ?? null;
  }

  const seasonId = getCurrentSeasonId();
  const seasonLabel = getSeasonLabel(seasonId);
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
  // eslint-disable-next-line react-hooks/purity -- server component (force-dynamic): render 1 lần/request nên Date.now() an toàn
  const isPremium = row?.premium_until && new Date(row.premium_until).getTime() > Date.now();
  const voteStreak = Number(row?.vote_streak || 0);
  const expPct = prog.expForNextLevel > 0 ? Math.min((prog.expIntoLevel / prog.expForNextLevel) * 100, 100) : 0;

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200">
      <header className="relative w-full max-w-4xl mx-auto px-6 py-5 flex items-center justify-between z-20">
        <Link href="/" className="text-xl font-black text-glow tracking-wider text-pink-300">
          WAGURI <span className="text-pink-400">🌸</span>
        </Link>
        <form action="/auth/signout" method="post">
          <button className="text-xs font-bold text-slate-400 hover:text-pink-300">Đăng xuất →</button>
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
              {jobName || "Nghề tự do"} · Lv.{prog.level}
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
                {isPremium ? "💎 Waguri Premium đang bật" : "💎 Nâng cấp Waguri Premium"}
              </p>
              <p className="text-xs text-pink-200/80 mt-0.5">
                {isPremium
                  ? "Cảm ơn cậu đã ủng hộ~ Bấm để gia hạn thêm."
                  : "150 chat AI/ngày · +10% thu nhập · badge 💎 — chỉ từ 25k 🌸"}
              </p>
            </div>
            <span className="text-pink-300 font-bold text-sm flex-shrink-0">{isPremium ? "Gia hạn →" : "Xem gói →"}</span>
          </div>
        </Link>

        {!row ? (
          <div className="glass-panel rounded-3xl p-8 text-center text-slate-400">
            Cậu chưa có dữ liệu game~ Vào Discord chơi vài lệnh (<code>/start</code>, <code>/daily</code>) rồi quay lại nhé! 🌸
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat label="💎 Tổng tài sản" value={`${fmtVND(wallet + bank)} VNĐ`} />
              <Stat label="💵 Ví tiền" value={`${fmtVND(wallet)} VNĐ`} />
              <Stat label="🏦 Ngân hàng" value={`${fmtVND(bank)} VNĐ`} />
              <Stat label="💞 Thân thiết Waguri" value={affectionTier(Number(row.affection || 0))} />
              <Stat label="🎖️ Thành tựu" value={`${achievements}`} />
              <Stat label="🗳️ Chuỗi vote" value={`${voteStreak} ngày`} />
            </div>

            {/* Sức khỏe & năng lượng */}
            <div className="glass-panel rounded-3xl p-6 space-y-4 border border-pink-300/10">
              <h2 className="text-lg font-extrabold text-white">❤️ Sức khỏe &amp; ⚡ Năng lượng</h2>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>❤️ Sức khỏe</span>
                    <span>{health}/100</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#1c1424] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-pink-400" style={{ width: `${health}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>⚡ Năng lượng</span>
                    <span>{energy}/{ENERGY_MAX}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#1c1424] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-yellow-400" style={{ width: `${(energy / ENERGY_MAX) * 100}%` }} />
                  </div>
                </div>
              </div>
              {health < 30 ? (
                <p className="text-xs text-rose-300">⚠️ Sức khỏe yếu (&lt;30) — dùng <code>/eat</code> thuốc/hộp y tế, <code>/nghingoi</code> hoặc <code>/hospital</code> để hồi nhé!</p>
              ) : null}
            </div>

            {/* Sổ Sứ Mệnh */}
            <div className="glass-panel rounded-3xl p-6 space-y-4 border border-pink-300/10">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-extrabold text-white flex items-center gap-1.5">📖 Sổ Sứ Mệnh</h2>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isPassPremium ? "bg-amber-400/20 text-amber-300 border border-amber-400/30" : "bg-slate-400/15 text-slate-300"}`}>
                  {isPassPremium ? "👑 Premium" : "🔓 Thường"}
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-400 font-medium">{seasonLabel}</span>
                  <span className="text-sm font-extrabold text-pink-300">Cấp {bpLevel}</span>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Tiến trình cấp</span>
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
                Xem Chi Tiết &amp; Nhận Quà →
              </Link>
            </div>

            {/* Nông trại & thú cưng */}
            <div className="glass-panel rounded-3xl p-6 space-y-3 border border-pink-300/10">
              <h2 className="text-lg font-extrabold text-white">🌾 Nông trại &amp; Thú cưng</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-2xl bg-pink-500/5 px-4 py-3">
                  <p className="text-xs text-pink-300/80">🐷 Heo</p>
                  <p className="text-white font-semibold">{pig ? (pig.sick ? "Đang bệnh 🤒" : `Giai đoạn: ${pig.stage}`) : "Chưa nuôi"}</p>
                </div>
                <div className="rounded-2xl bg-pink-500/5 px-4 py-3">
                  <p className="text-xs text-pink-300/80">🌱 Cây</p>
                  <p className="text-white font-semibold">{plant ? `Giai đoạn: ${plant.stage}` : "Chưa trồng"}</p>
                </div>
                <div className="rounded-2xl bg-pink-500/5 px-4 py-3">
                  <p className="text-xs text-pink-300/80">🐾 Thú cưng</p>
                  <p className="text-white font-semibold">{pet ? (pet.name || pet.species || "Có") : "Chưa có"}</p>
                </div>
              </div>
            </div>

            {/* Settings */}
            <div className="glass-panel rounded-3xl p-6 space-y-4 border border-pink-300/10">
              <h2 className="text-lg font-extrabold text-white">⚙️ Cài đặt</h2>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Hiển thị hồ sơ web</p>
                  <p className="text-xs text-slate-400">
                    {isPublic ? (
                      <>
                        Đang công khai:{" "}
                        <Link href={`/u/${id}`} className="text-pink-300 hover:underline">
                          waguri-bot.vercel.app/u/{id}
                        </Link>
                      </>
                    ) : (
                      "Đang ẩn — người khác không xem được hồ sơ của cậu."
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isPublic ? <ShareProfileButton id={id} /> : null}
                  <form action={toggleProfilePublic}>
                    <button className="px-4 py-2 rounded-full text-xs font-bold border border-pink-300/30 text-pink-200 hover:border-pink-300/60 transition-all whitespace-nowrap">
                      {isPublic ? "🙈 Ẩn đi" : "👁️ Hiện"}
                    </button>
                  </form>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-slate-800 pt-4">
                <div>
                  <p className="text-sm font-semibold text-white">Nhắc vote qua DM</p>
                  <p className="text-xs text-slate-400">
                    {voteReminder ? "Đang bật — Waguri nhắc khi đủ 12h để vote lại." : "Đang tắt."}
                  </p>
                </div>
                <form action={toggleVoteReminder}>
                  <button className="px-4 py-2 rounded-full text-xs font-bold border border-pink-300/30 text-pink-200 hover:border-pink-300/60 transition-all whitespace-nowrap">
                    {voteReminder ? "🔕 Tắt" : "🔔 Bật"}
                  </button>
                </form>
              </div>
            </div>
          </>
        )}

        {manageGuilds.length > 0 ? (
          <div className="glass-panel rounded-3xl p-6 space-y-3 border border-pink-300/10">
            <h2 className="text-lg font-extrabold text-white">🛠️ Quản lý server</h2>
            <p className="text-xs text-slate-400">Server cậu có quyền Quản lý — bấm để chỉnh cài đặt bot:</p>
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
            <h2 className="text-lg font-extrabold text-white">🏆 Bảng xếp hạng server của bạn</h2>
            <p className="text-xs text-slate-400">Các server cậu tham gia mà Waguri cũng có mặt — bấm để xem BXH riêng:</p>
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
            🏆 Xem bảng xếp hạng toàn cầu
          </Link>
        </div>
      </main>
    </div>
  );
}

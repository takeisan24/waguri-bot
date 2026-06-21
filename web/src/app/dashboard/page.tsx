import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { createAdminClient } from "../../lib/supabase/admin";
import { getDiscordIdentity } from "../../lib/discord";
import { getLevelProgress, affectionTier, fmtVND } from "../../lib/game";
import { toggleProfilePublic, toggleVoteReminder } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bảng điều khiển — Waguri 🌸" };

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
    (user.user_metadata?.guilds as { id: string; name: string; icon: string | null }[] | undefined) ?? [];

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

  const prog = getLevelProgress(Number(row?.exp || 0));
  const wallet = Number(row?.wallet || 0);
  const bank = Number(row?.bank || 0);
  const isPublic = row?.profile_public !== false;
  const voteReminder = row?.vote_reminder !== false;
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
                <form action={toggleProfilePublic}>
                  <button className="px-4 py-2 rounded-full text-xs font-bold border border-pink-300/30 text-pink-200 hover:border-pink-300/60 transition-all whitespace-nowrap">
                    {isPublic ? "🙈 Ẩn đi" : "👁️ Hiện"}
                  </button>
                </form>
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

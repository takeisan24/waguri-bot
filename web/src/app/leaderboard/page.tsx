import React from "react";
import Link from "next/link";
import CherryBlossom from "../../components/CherryBlossom";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { BOT_API } from "../../lib/botApi";
import { createClient } from "../../lib/supabase/server";
import { getDiscordIdentity } from "../../lib/discord";
import { getLocaleServer, t } from "../../lib/i18n";

export async function generateMetadata() {
  const locale = await getLocaleServer();
  return {
    title: t("leaderboard.meta_title", locale),
    description: t("leaderboard.meta_desc", locale),
  };
}

const API = BOT_API;
const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");
const MEDALS = ["🥇", "🥈", "🥉"];

type Row = { id: string; username: string; avatar: string | null; value: number; level?: number; likes?: number };

async function getBoard(type: "wealth" | "level" | "bakery", guild?: string): Promise<Row[]> {
  try {
    const url = `${API}/api/leaderboard?type=${type}&limit=10${guild ? `&guild=${encodeURIComponent(guild)}` : ""}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const d = await res.json();
    return d.rows || [];
  } catch {
    return [];
  }
}

function Board({
  title,
  rows,
  suffix = "",
  prefix = "",
  emptyText = "",
  type = "wealth"
}: {
  title: string;
  rows: Row[];
  suffix?: string;
  prefix?: string;
  emptyText: string;
  type?: "wealth" | "level" | "bakery";
}) {
  return (
    <div className="glass-panel rounded-3xl p-6 border border-pink-300/15 space-y-3">
      <h2 className="text-lg font-extrabold text-white">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-slate-500 text-sm">{emptyText}</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.id}>
              <Link
                href={type === "bakery" ? `/tiem/${r.id}` : `/u/${r.id}`}
                className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-pink-500/5 transition-colors"
              >
                <span className="w-7 text-center font-bold text-pink-300">{MEDALS[i] || i + 1}</span>
                {r.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.avatar} alt={r.username} width={32} height={32} className="rounded-full" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-[#241a2e]" />
                )}
                <span className="flex-1 truncate text-slate-200">{r.username}</span>
                <span className="font-bold text-white">
                  {type === "bakery" ? (
                    <span className="text-xs text-pink-300 font-medium">
                      Lv.{r.level || 1} · {r.likes || 0} ❤️ ({fmt(r.value)} pts)
                    </span>
                  ) : (
                    <>
                      {prefix}
                      {fmt(r.value)}
                      {suffix}
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ guild?: string; name?: string; tab?: string }>;
}) {
  const locale = await getLocaleServer();
  const sp = await searchParams;
  const guild = sp.guild && /^\d{5,25}$/.test(sp.guild) ? sp.guild : undefined;
  const serverName = sp.name ? decodeURIComponent(sp.name) : null;
  const tab = sp.tab === "level" ? "level" : (sp.tab === "bakery" ? "bakery" : "wealth");
  const rows = await getBoard(tab, guild);

  // "Hạng của bạn" — chỉ hiện ở BXH toàn cầu khi đang đăng nhập & hồ sơ không ẩn.
  let myRank: { rank: number; netWorth: number; username: string } | null = null;
  if (!guild && tab === "wealth") {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const myId = user ? getDiscordIdentity(user).id : null;
      if (myId) {
        const res = await fetch(`${API}/api/profile/${myId}`, { next: { revalidate: 60 } });
        if (res.ok) {
          const p = await res.json();
          if (p && !p.hidden && typeof p.rank === "number" && p.rank > 0) {
            myRank = { rank: p.rank, netWorth: Number(p.netWorth || 0), username: p.username };
          }
        }
      }
    } catch {
      /* chưa đăng nhập / bot offline -> bỏ qua */
    }
  }

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
          <h1 className="text-3xl md:text-4xl font-black text-white">
            🏆 {guild ? t("leaderboard.title_server", locale) : t("leaderboard.title_global", locale)}
          </h1>
          <p className="text-slate-400 text-sm">
            {guild
              ? t("leaderboard.subtitle_server", locale, { name: serverName || "" })
              : t("leaderboard.subtitle_global", locale)}
          </p>
          {guild ? (
            <Link href="/leaderboard" className="inline-block text-xs text-pink-300 hover:underline pt-1">
              {t("leaderboard.view_global", locale)}
            </Link>
          ) : null}
        </div>

        {/* Tab Selection */}
        <div className="flex justify-center gap-2 p-1.5 max-w-md mx-auto rounded-2xl bg-pink-950/10 border border-pink-300/10">
          {(["wealth", "level", "bakery"] as const).map((tId) => {
            const isActive = tab === tId;
            const label = tId === "wealth" ? t("leaderboard.board_wealth", locale) :
                          tId === "level" ? t("leaderboard.board_level", locale) :
                          t("leaderboard.board_bakery", locale);
            const queryParams = new URLSearchParams();
            if (guild) queryParams.set("guild", guild);
            if (serverName) queryParams.set("name", serverName);
            queryParams.set("tab", tId);

            return (
              <Link
                key={tId}
                href={`/leaderboard?${queryParams.toString()}`}
                className={`flex-1 text-center py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? "bg-pink-300 text-[#0d0812] shadow-lg shadow-pink-300/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-pink-500/5"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {myRank ? (
          <div className="glass-panel rounded-2xl px-5 py-3 flex items-center justify-between gap-4 border border-pink-400/30">
            <span className="text-sm text-pink-200">
              {t("leaderboard.my_rank", locale, { username: myRank.username })}
            </span>
            <span className="text-sm font-bold text-white">
              #{myRank.rank} · {fmt(myRank.netWorth)} {t("common.currency", locale)}
            </span>
          </div>
        ) : null}

        <div className="max-w-2xl mx-auto">
          <Board
            type={tab}
            title={
              tab === "wealth" ? t("leaderboard.board_wealth", locale) :
              tab === "level" ? t("leaderboard.board_level", locale) :
              t("leaderboard.board_bakery", locale)
            }
            rows={rows}
            suffix={tab === "wealth" ? ` ${t("common.currency", locale)}` : ""}
            prefix={tab === "level" ? "Lv." : ""}
            emptyText={t("leaderboard.empty", locale)}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

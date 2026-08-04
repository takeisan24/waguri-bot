import React from "react";
import Link from "next/link";
import CherryBlossom from "../../components/CherryBlossom";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { BOT_API } from "../../lib/botApi";
import { createClient } from "../../lib/supabase/server";
import { createAdminClient } from "../../lib/supabase/admin";
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

// GHI CHÚ: Đã BỎ "hydrate Discord profile" (fetch users/{id} không kèm bot token -> luôn 401) — nó là
// no-op, lại nằm NGOÀI timeout guard nên treo SSR theo độ trễ Discord. Tên/avatar đã có sẵn trong DB.

async function getBoard(type: "wealth" | "level" | "bakery", guild?: string): Promise<Row[]> {
  try {
    const admin = createAdminClient();
    const rows: Row[] = [];

    if (type === "bakery") {
      const { data } = await admin
        .from("bakeries")
        .select("user_id, bakery_score, level, likes_count")
        .order("bakery_score", { ascending: false })
        .limit(10);
      if (data) {
        for (const r of data) {
          rows.push({
            id: r.user_id,
            username: `Chủ tiệm #${r.user_id.slice(-4)}`,
            avatar: null,
            value: Number(r.bakery_score || 0),
            level: r.level || 1,
            likes: r.likes_count || 0,
          });
        }
      }
    } else if (type === "level") {
      const { data } = await admin
        .from("users")
        .select("user_id, exp, username, avatar")
        .not("profile_public", "is", false) // tôn trọng hồ sơ ẩn
        .order("exp", { ascending: false })
        .limit(10);
      if (data) {
        for (const r of data) {
          const exp = Number(r.exp || 0);
          const lvl = Math.floor(Math.sqrt(exp / 1000)) + 1;
          rows.push({
            id: r.user_id,
            username: r.username || `Người chơi #${r.user_id.slice(-4)}`,
            avatar: r.avatar || null,
            value: lvl,
          });
        }
      }
    } else {
      const { data, error } = await admin.rpc("leaderboard_rows", { p_sort: "wealth", p_limit: 10 });
      if (!error && Array.isArray(data) && data.length > 0) {
        for (const r of data) {
          rows.push({
            id: r.user_id,
            username: r.username || `Người chơi #${r.user_id.slice(-4)}`,
            avatar: r.avatar || null,
            value: Number(r.networth || 0),
          });
        }
      } else {
        const { data: usersData } = await admin
          .from("users")
          .select("user_id, wallet, bank, username, avatar")
          .not("profile_public", "is", false) // tôn trọng hồ sơ ẩn
          .order("wallet", { ascending: false })
          .limit(10);
        if (usersData) {
          for (const r of usersData) {
            rows.push({
              id: r.user_id,
              username: r.username || `Người chơi #${r.user_id.slice(-4)}`,
              avatar: r.avatar || null,
              value: Number(r.wallet || 0) + Number(r.bank || 0),
            });
          }
        }
      }
    }
    if (rows.length > 0) {
      return rows;
    }
  } catch {
    /* Fallback sang Bot API */
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1200);
    const url = `${API}/api/leaderboard?type=${type}&limit=10${guild ? `&guild=${encodeURIComponent(guild)}` : ""}`;
    const res = await fetch(url, { signal: ctrl.signal, next: { revalidate: 60 } });
    clearTimeout(timer);
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d.rows) && d.rows.length > 0) return d.rows;
    }
  } catch {
    /* Ignore */
  }

  return [];
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
        // Ưu tiên đọc trực tiếp từ Supabase DB (Siêu tốc: ~15ms)
        const admin = createAdminClient();
        // Đọc hồ sơ + HẠNG thật song song (trước đây rank hardcode = 1 -> ai cũng thấy "#1").
        const [myRes, rankRes] = await Promise.all([
          admin.from("users").select("user_id, wallet, bank, username").eq("user_id", myId).single(),
          admin.rpc("user_wealth_rank", { p_user: myId }),
        ]);
        const myData = myRes.data;

        if (myData) {
          const myNetworth = Number(myData.wallet || 0) + Number(myData.bank || 0);
          myRank = {
            rank: Number(rankRes.data) || 1,
            netWorth: myNetworth,
            username: myData.username || getDiscordIdentity(user).username || "Bạn",
          };
        }
      }
    } catch {
      /* chưa đăng nhập / DB rỗng -> thử fallback từ Bot API với 1s timeout */
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const myId = user ? getDiscordIdentity(user).id : null;
        if (myId) {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 1000);
          const res = await fetch(`${API}/api/profile/${myId}`, { signal: ctrl.signal, next: { revalidate: 60 } });
          clearTimeout(timer);
          if (res.ok) {
            const p = await res.json();
            if (p && !p.hidden && typeof p.rank === "number" && p.rank > 0) {
              myRank = { rank: p.rank, netWorth: Number(p.netWorth || 0), username: p.username };
            }
          }
        }
      } catch {
        /* Bỏ qua */
      }
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

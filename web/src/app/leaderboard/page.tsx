import React from "react";
import Link from "next/link";
import CherryBlossom from "../../components/CherryBlossom";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

export const metadata = {
  title: "Bảng xếp hạng 🏆 — Waguri",
  description: "Top đại gia và cao thủ của Waguri — ai giàu nhất, ai chăm chỉ nhất?",
};

const API = "https://chocobot.wispbyte.app";
const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");
const MEDALS = ["🥇", "🥈", "🥉"];

type Row = { id: string; username: string; avatar: string | null; value: number };

async function getBoard(type: "wealth" | "level", guild?: string): Promise<Row[]> {
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

function Board({ title, rows, suffix = "", prefix = "" }: { title: string; rows: Row[]; suffix?: string; prefix?: string }) {
  return (
    <div className="glass-panel rounded-3xl p-6 border border-pink-300/15 space-y-3">
      <h2 className="text-lg font-extrabold text-white">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-slate-500 text-sm">Chưa có ai trên bảng~ 🌸</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.id}>
              <Link
                href={`/u/${r.id}`}
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
                  {prefix}
                  {fmt(r.value)}
                  {suffix}
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
  searchParams: Promise<{ guild?: string; name?: string }>;
}) {
  const sp = await searchParams;
  const guild = sp.guild && /^\d{5,25}$/.test(sp.guild) ? sp.guild : undefined;
  const serverName = sp.name ? decodeURIComponent(sp.name) : null;
  const [wealth, level] = await Promise.all([getBoard("wealth", guild), getBoard("level", guild)]);

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
            🏆 {guild ? "Bảng xếp hạng server" : "Bảng xếp hạng Waguri"}
          </h1>
          <p className="text-slate-400 text-sm">
            {guild
              ? `${serverName ? `Server ${serverName} — ` : ""}bấm vào tên để xem hồ sơ.`
              : "Top toàn cầu — bấm vào tên để xem hồ sơ chi tiết."}
          </p>
          {guild ? (
            <Link href="/leaderboard" className="inline-block text-xs text-pink-300 hover:underline pt-1">
              ← Xem bảng toàn cầu
            </Link>
          ) : null}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Board title="💎 Đại gia (tài sản)" rows={wealth} suffix=" VNĐ" />
          <Board title="⭐ Cao thủ (cấp độ)" rows={level} prefix="Lv." />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

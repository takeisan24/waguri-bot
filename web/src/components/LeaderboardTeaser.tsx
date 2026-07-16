"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BOT_API } from "../lib/botApi";
import { useLanguage } from "./LanguageProvider";

// Teaser top đại gia — fetch CLIENT-side (như LiveStats) để KHÔNG chặn render landing.
const API = BOT_API;
const MEDALS = ["🥇", "🥈", "🥉"];

type Row = { id: string; username: string; avatar: string | null; value: number };

export default function LeaderboardTeaser() {
  const { t, locale } = useLanguage();
  const fmt = (n: number) => Number(n || 0).toLocaleString(locale === "en" ? "en-US" : "vi-VN");
  const [rows, setRows] = useState<Row[] | null>(null); // null = đang tải

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    fetch(`${API}/api/leaderboard?type=wealth&limit=5`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setRows(Array.isArray(d?.rows) ? d.rows.slice(0, 5) : []))
      .catch(() => setRows([]))
      .finally(() => clearTimeout(t));
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, []);

  return (
    <section className="w-full py-12 md:py-16">
      <div className="text-center max-w-2xl mx-auto mb-8 space-y-2">
        <h2 className="text-3xl md:text-4xl font-extrabold text-white">{t("lb_teaser.title")}</h2>
        <p className="text-slate-400 text-sm md:text-base">{t("lb_teaser.subtitle")}</p>
      </div>
      <div className="max-w-xl mx-auto glass-panel rounded-3xl p-5 border border-pink-300/15">
        {rows === null ? (
          <ol className="space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2">
                <span className="w-7 h-4 rounded bg-pink-300/10 animate-pulse" />
                <span className="w-8 h-8 rounded-full bg-pink-300/10 animate-pulse" />
                <span className="flex-1 h-3.5 rounded bg-pink-300/10 animate-pulse" />
                <span className="w-16 h-3.5 rounded bg-pink-300/10 animate-pulse" />
              </li>
            ))}
          </ol>
        ) : rows.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-4">{t("lb_teaser.updating")}</p>
        ) : (
          <ol className="space-y-1.5">
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
                    {fmt(r.value)} <span className="text-pink-300/70 text-xs">{t("lb_teaser.currency")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
        <div className="text-center mt-3">
          <Link href="/leaderboard" className="inline-block text-sm font-bold text-pink-300 hover:text-pink-200">
            {t("lb_teaser.view_full")}
          </Link>
        </div>
      </div>
    </section>
  );
}

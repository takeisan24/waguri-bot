"use client";

import { useEffect, useState } from "react";
import { BOT_API } from "../lib/botApi";
import { useLanguage } from "./LanguageProvider";

// Endpoint /stats do bot tự phục vụ (src/lib/voteServer.js) — JSON { servers, users }.
const STATS_URL = `${BOT_API}/stats`;

type Stats = { servers: number; users: number };

export default function LiveStats() {
  const { t, locale } = useLanguage();
  const fmt = (n: number) => n.toLocaleString(locale === "en" ? "en-US" : "vi-VN");
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000); // không chờ quá lâu
    fetch(STATS_URL, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Stats) => {
        if (typeof d?.servers === "number") setStats(d);
      })
      .catch(() => {
        /* bot offline / chưa mở cổng -> ẩn widget, không hiện trạng thái gãy */
      })
      .finally(() => clearTimeout(t));
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, []);

  // Chưa có số liệu thật -> không render gì (tránh hiện "0 server")
  if (!stats || stats.servers <= 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-sm">
      <span className="inline-flex items-center gap-2 rounded-full border border-pink-300/20 bg-pink-500/5 px-4 py-1.5 text-pink-200 backdrop-blur-md">
        🌸 {t("livestats.serving")} <strong className="text-pink-300">{fmt(stats.servers)}</strong> {t("livestats.servers")}
      </span>
      <span className="inline-flex items-center gap-2 rounded-full border border-pink-300/20 bg-pink-500/5 px-4 py-1.5 text-pink-200 backdrop-blur-md">
        👥 <strong className="text-pink-300">{fmt(stats.users)}</strong> {t("livestats.members")}
      </span>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { BOT_API_CLIENT } from "../lib/botApi";
import { useLanguage } from "./LanguageProvider";

// Endpoint /stats do bot tự phục vụ (src/lib/voteServer.js) — JSON { servers, users }.
// Gọi qua cầu nối CÙNG NGUỒN `/api/bot/*` chứ không gọi thẳng host của bot: trang này
// chạy HTTPS, mà bot phục vụ ở `http://<ip>:15247`. Trình duyệt chặn cứng fetch HTTP từ
// trang HTTPS (mixed content) — và chặn IM LẶNG, nên widget chỉ đơn giản không bao giờ hiện.
const STATS_URL = `${BOT_API_CLIENT}/stats`;

// `users`   = tổng thành viên các server (một người ở nhiều server bị đếm nhiều lần).
// `players` = người THẬT đã dùng bot. Hai con số này rất khác nhau — 2.295 so với 470 —
//             nên hiện cả hai, đừng để người đọc tưởng `users` là số người chơi.
type Stats = {
  servers: number;
  users: number;
  players?: number;
  activePlayers?: number;
};

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
      {typeof stats.players === "number" && stats.players > 0 && (
        <span className="inline-flex items-center gap-2 rounded-full border border-pink-300/20 bg-pink-500/5 px-4 py-1.5 text-pink-200 backdrop-blur-md">
          🌸 <strong className="text-pink-300">{fmt(stats.players)}</strong> {t("livestats.players")}
          {typeof stats.activePlayers === "number" && stats.activePlayers > 0 && (
            <span className="text-pink-200/60">
              · {fmt(stats.activePlayers)} {t("livestats.active")}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

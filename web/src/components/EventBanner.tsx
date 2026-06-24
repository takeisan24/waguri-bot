"use client";

import { useEffect, useState } from "react";
import { BOT_API } from "../lib/botApi";

// Banner sự kiện toàn cục đang chạy (đồng bộ với lịch sự kiện auto của bot — data/events.js).
// Fetch client-side (như LiveStats) để không chặn render & không cần force-dynamic ở landing.
type Ev = { active: boolean; mult: number; name: string | null; until: number };

export default function EventBanner() {
  const [ev, setEv] = useState<Ev | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    fetch(`${BOT_API}/api/event`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Ev) => {
        if (d?.active && Number(d.mult) > 1) setEv(d);
      })
      .catch(() => {
        /* bot offline / không có sự kiện -> ẩn banner */
      })
      .finally(() => clearTimeout(t));
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, []);

  if (!ev) return null;

  return (
    <div className="rounded-2xl border border-amber-300/30 bg-gradient-to-r from-amber-500/10 via-pink-500/10 to-purple-500/10 px-5 py-3 text-center backdrop-blur-md">
      <span className="text-sm font-bold text-amber-200">
        🎉 Đang có sự kiện{" "}
        {ev.name ? <span className="text-white">{ev.name}</span> : "đặc biệt"} — nhân{" "}
        <span className="text-white">x{ev.mult}</span> thu nhập &amp; EXP toàn server! 🌸
      </span>
    </div>
  );
}

import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { setGuildFlag } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cấu hình server — Waguri 🌸", robots: { index: false } };

function Toggle({
  label,
  desc,
  on,
  action,
}: {
  label: string;
  desc: string;
  on: boolean;
  action: () => Promise<void>;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-slate-800 pt-4 first:border-0 first:pt-0">
      <div>
        <p className="text-sm font-semibold text-white">
          {label} {on ? <span className="text-emerald-400">🟢 Bật</span> : <span className="text-rose-400">🔴 Tắt</span>}
        </p>
        <p className="text-xs text-slate-400">{desc}</p>
      </div>
      <form action={action}>
        <button className="px-4 py-2 rounded-full text-xs font-bold border border-pink-300/30 text-pink-200 hover:border-pink-300/60 transition-all whitespace-nowrap">
          {on ? "Tắt đi" : "Bật lên"}
        </button>
      </form>
    </div>
  );
}

export default async function ServerConfig({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const guilds = (user.user_metadata?.guilds as { id: string; name: string; manage?: boolean }[] | undefined) ?? [];
  const guild = guilds.find((g) => g.id === id);
  if (!guild || !guild.manage) redirect("/dashboard"); // không có quyền Quản lý Server

  const admin = createAdminClient();
  const { data } = await admin.from("guild_settings").select("settings").eq("guild_id", id).single();
  const s = (data?.settings as Record<string, string>) || {};
  const aiOn = s.ai_enabled !== "0";
  const pvpOn = s.pvp !== "0";
  const jailOn = s.police_jail !== "0";
  const gambleOn = s.gambling !== "0";

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200">
      <header className="w-full max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="text-xl font-black text-glow tracking-wider text-pink-300">
          WAGURI <span className="text-pink-400">🌸</span>
        </Link>
        <Link href="/dashboard" className="text-xs font-bold text-slate-400 hover:text-pink-300">
          ← Dashboard
        </Link>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white">⚙️ Cấu hình server</h1>
          <p className="text-pink-300 text-sm mt-1">🏰 {guild.name}</p>
          <p className="text-xs text-slate-500 mt-1">
            Đổi ở đây sẽ áp dụng NGAY cho bot (và đồng bộ với lệnh <code>/config</code> trong Discord).
          </p>
        </div>

        <div className="glass-panel rounded-3xl p-6 space-y-4 border border-pink-300/10">
          <Toggle
            label="Trò chuyện AI (@tag Waguri)"
            desc="Cho phép thành viên trò chuyện với Waguri bằng AI khi tag bot."
            on={aiOn}
            action={setGuildFlag.bind(null, id, "ai_enabled", aiOn ? "0" : "1")}
          />
          <Toggle
            label="PvP (cướp /rob + trộm heo/cây)"
            desc="Cho phép người chơi cướp tiền & trộm nông sản của nhau."
            on={pvpOn}
            action={setGuildFlag.bind(null, id, "pvp", pvpOn ? "0" : "1")}
          />
          <Toggle
            label="Trò may rủi (bài cào, tài xỉu, xóc đĩa…)"
            desc="Cho phép thành viên chơi các trò đặt cược. Tắt = mọi lệnh chơi bị từ chối nhẹ nhàng."
            on={gambleOn}
            action={setGuildFlag.bind(null, id, "gambling", gambleOn ? "0" : "1")}
          />
          <Toggle
            label="Tạm giam (Discord timeout) khi vi phạm"
            desc="Khi công an kiểm tra trò may rủi: bật = tạm giam (timeout); tắt = chỉ phạt tiền."
            on={jailOn}
            action={setGuildFlag.bind(null, id, "police_jail", jailOn ? "0" : "1")}
          />
        </div>

        <p className="text-xs text-slate-500">
          💡 Đặt kênh AI / kênh confession bằng lệnh <code>/config</code> trong Discord (có bộ chọn kênh tiện hơn).
        </p>
      </main>
    </div>
  );
}

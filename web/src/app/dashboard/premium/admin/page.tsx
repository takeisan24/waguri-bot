import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../../lib/discord";
import { fmtVND } from "../../../../lib/game";
import { isOwnerId } from "../../../../lib/owner";
import { approvePremiumOrderWeb } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Duyệt Premium — Waguri 🌸", robots: { index: false } };

const PLAN_LABEL: Record<string, string> = { m1: "1 tháng", m3: "3 tháng", m6: "6 tháng" };

export default async function PremiumAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { id } = getDiscordIdentity(user);
  if (!isOwnerId(id)) redirect("/dashboard"); // chỉ owner

  const admin = createAdminClient();
  const { data: orders } = await admin
    .from("premium_orders")
    .select("code, user_id, plan, months, amount, claimed_at, created_at")
    .eq("status", "pending")
    .order("claimed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(50);
  const list = orders ?? [];

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200">
      <header className="w-full max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="text-xl font-black text-glow tracking-wider text-pink-300">
          WAGURI <span className="text-pink-400">🌸</span>
        </Link>
        <Link href="/dashboard/premium" className="text-xs font-bold text-slate-400 hover:text-pink-300">
          ← Premium
        </Link>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-6 space-y-5">
        <div>
          <h1 className="text-2xl font-black text-white">🛠️ Duyệt đơn Premium</h1>
          <p className="text-xs text-slate-400 mt-1">
            Đối chiếu nội dung CK trong app VCB với <b>mã đơn</b> rồi bấm <b>Kích hoạt</b>. 🔔 = buyer đã báo đã chuyển.
          </p>
        </div>

        {list.length === 0 ? (
          <div className="glass-panel rounded-3xl p-8 text-center text-slate-400">Không có đơn nào đang chờ duyệt~ 🌸</div>
        ) : (
          <div className="space-y-3">
            {list.map((o) => (
              <div
                key={o.code}
                className={`glass-panel rounded-2xl p-4 flex items-center justify-between gap-4 border ${
                  o.claimed_at ? "border-pink-400/40" : "border-pink-300/10"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">
                    {o.claimed_at ? "🔔 " : ""}
                    <code className="text-pink-300">{o.code}</code> · {fmtVND(o.amount)}đ
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {PLAN_LABEL[o.plan] ?? o.plan} · Discord ID <code>{o.user_id}</code>
                    {o.claimed_at ? " · đã báo CK" : ""}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Tạo: {new Date(o.created_at).toLocaleString("vi-VN")}
                  </p>
                </div>
                <form action={approvePremiumOrderWeb.bind(null, o.code)} className="flex-shrink-0">
                  <button className="px-4 py-2 rounded-full bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-400 transition-all whitespace-nowrap">
                    ✅ Kích hoạt
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-slate-500">
          💡 Duyệt ở đây kích hoạt Premium ngay (trang của buyer tự nhảy &quot;thành công&quot;). Muốn bot DM cảm ơn
          buyer thì duyệt bằng lệnh <code>/premium-admin duyet</code> trong Discord.
        </p>
      </main>
    </div>
  );
}

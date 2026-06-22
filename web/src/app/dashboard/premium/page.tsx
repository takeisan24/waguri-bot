import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../lib/discord";
import { fmtVND } from "../../../lib/game";
import { PREMIUM_PLANS, PLAN_ORDER } from "../../../lib/premium";
import { isOwnerId } from "../../../lib/owner";
import { createPremiumOrder } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Waguri Premium 💎", robots: { index: false } };

const BENEFITS = [
  ["💬", "150 lượt chat AI / ngày", "Gấp 10 lần gói miễn phí — tâm sự với Waguri thả ga."],
  ["💰", "+10% thu nhập", "Mọi lệnh /work /fish /mine /chop đều cộng thêm."],
  ["💎", "Huy hiệu Premium", "Badge 💎 nổi bật trong hồ sơ web & Discord."],
  ["✨", "Ưu tiên tính năng mới", "Trải nghiệm sớm trước khi ra mắt rộng rãi."],
];

export default async function PremiumPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { id } = getDiscordIdentity(user);
  if (!id) redirect("/login");

  const admin = createAdminClient();
  const { data: row } = await admin.from("users").select("premium_until").eq("user_id", id).single();
  const until = row?.premium_until ? new Date(row.premium_until) : null;
  const active = until ? until.getTime() > Date.now() : false;

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200">
      <header className="w-full max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="text-xl font-black text-glow tracking-wider text-pink-300">
          WAGURI <span className="text-pink-400">🌸</span>
        </Link>
        <div className="flex items-center gap-4">
          {isOwnerId(id) ? (
            <Link href="/dashboard/premium/admin" className="text-xs font-bold text-emerald-300 hover:text-emerald-200">
              🛠️ Duyệt đơn
            </Link>
          ) : null}
          <Link href="/dashboard" className="text-xs font-bold text-slate-400 hover:text-pink-300">
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-6 space-y-7">
        <div className="text-center">
          <h1 className="text-3xl font-black text-white">
            Waguri <span className="text-pink-300">Premium</span> 💎
          </h1>
          {active ? (
            <p className="mt-2 inline-block px-4 py-1.5 rounded-full bg-emerald-500/15 text-emerald-300 text-sm font-bold">
              ✅ Đang kích hoạt — hết hạn{" "}
              {until!.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </p>
          ) : (
            <p className="mt-2 text-pink-200/80 text-sm">Mở khoá toàn bộ quyền lợi — giá mềm cho hội bạn 🌸</p>
          )}
        </div>

        {/* Quyền lợi */}
        <div className="grid sm:grid-cols-2 gap-3">
          {BENEFITS.map(([icon, title, desc]) => (
            <div key={title} className="glass-panel rounded-2xl p-4 border border-pink-300/10 flex gap-3">
              <span className="text-2xl">{icon}</span>
              <div>
                <p className="text-sm font-bold text-white">{title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bảng giá */}
        <div className="space-y-3">
          <h2 className="text-lg font-extrabold text-white text-center">Chọn gói {active ? "để gia hạn thêm" : ""}</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {PLAN_ORDER.map((pid) => {
              const p = PREMIUM_PLANS[pid];
              const best = pid === "m6";
              return (
                <form
                  key={pid}
                  action={createPremiumOrder.bind(null, pid)}
                  className={`relative glass-panel rounded-2xl p-5 border text-center flex flex-col gap-2 ${
                    best ? "border-pink-400/50 ring-1 ring-pink-400/30" : "border-pink-300/10"
                  }`}
                >
                  {best ? (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-pink-500 text-[10px] font-black text-white">
                      ĐÁNG MUA NHẤT
                    </span>
                  ) : null}
                  <p className="text-sm font-bold text-pink-200">{p.label}</p>
                  <p className="text-2xl font-black text-white">{fmtVND(p.amount)}đ</p>
                  <p className="text-[11px] text-slate-400 min-h-[28px]">{p.note}</p>
                  <button
                    className={`mt-1 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                      best
                        ? "bg-pink-500 text-white hover:bg-pink-400"
                        : "border border-pink-300/30 text-pink-200 hover:border-pink-300/60"
                    }`}
                  >
                    {active ? "Gia hạn" : "Mua ngay"}
                  </button>
                </form>
              );
            })}
          </div>
          <p className="text-center text-xs text-slate-500">
            Thanh toán quét mã VietQR (chuyển khoản ngân hàng) — kích hoạt tự động trong vài giây. 💝
          </p>
        </div>
      </main>
    </div>
  );
}

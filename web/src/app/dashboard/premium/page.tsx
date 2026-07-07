import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../lib/discord";
import { fmtVND } from "../../../lib/game";
import { PLAN_ORDER, getLocalizedPlans } from "../../../lib/premium";
import { isOwnerId } from "../../../lib/owner";
import { createPremiumOrder } from "./actions";
import { getLocaleServer, t } from "../../../lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getLocaleServer();
  return {
    title: t("premium.meta_title", locale),
    robots: { index: false }
  };
}

export default async function PremiumPage() {
  const locale = await getLocaleServer();
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
  // eslint-disable-next-line react-hooks/purity
  const active = until ? until.getTime() > Date.now() : false;

  const plans = getLocalizedPlans(locale);

  const BENEFITS = [
    ["💬", t("premium.benefit_ai_chat", locale), t("premium.benefit_ai_chat_desc", locale)],
    ["💰", t("premium.benefit_income", locale), t("premium.benefit_income_desc", locale)],
    ["💎", t("premium.benefit_badge", locale), t("premium.benefit_badge_desc", locale)],
    ["✨", t("premium.benefit_early_access", locale), t("premium.benefit_early_access_desc", locale)],
  ];

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200">
      <header className="w-full max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="text-xl font-black text-glow tracking-wider text-pink-300">
          WAGURI <span className="text-pink-400">🌸</span>
        </Link>
        <div className="flex items-center gap-4">
          {isOwnerId(id) ? (
            <Link href="/dashboard/premium/admin" className="text-xs font-bold text-emerald-300 hover:text-emerald-200">
              {t("premium.review_orders", locale)}
            </Link>
          ) : null}
          <Link href="/dashboard" className="text-xs font-bold text-slate-400 hover:text-pink-300">
            {t("premium.back_to_dashboard", locale)}
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-6 space-y-7">
        <div className="text-center">
          <h1 className="text-3xl font-black text-white">
            Waguri <span className="text-pink-300">{t("premium.title_premium", locale)}</span> 💎
          </h1>
          {active ? (
            <p className="mt-2 inline-block px-4 py-1.5 rounded-full bg-emerald-500/15 text-emerald-300 text-sm font-bold">
              {t("premium.active_until", locale, {
                date: until!.toLocaleDateString(locale === "en" ? "en-US" : "vi-VN", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                }),
              })}
            </p>
          ) : (
            <p className="mt-2 text-pink-200/80 text-sm">{t("premium.unlock_desc", locale)}</p>
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

        {/* So sánh Miễn phí vs Premium */}
        <div className="glass-panel rounded-2xl p-5 border border-pink-300/10">
          <h2 className="text-base font-extrabold text-white text-center mb-3">{t("premium.comparison_title", locale)}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-pink-300/10">
                <th className="text-left font-medium py-2">{t("premium.col_benefit", locale)}</th>
                <th className="text-center font-medium py-2">{t("premium.col_free", locale)}</th>
                <th className="text-center font-bold text-pink-300 py-2">{t("premium.col_premium", locale)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pink-300/5">
              {[
                [t("premium.benefit_ai_chat", locale), "15", "150"],
                [t("premium.benefit_income", locale), "×1", "+10%"],
                [t("premium.benefit_badge", locale), "—", "✓"],
                [t("premium.benefit_early_access", locale), "—", "✓"],
              ].map(([label, free, prem]) => (
                <tr key={label}>
                  <td className="py-2 text-slate-300">{label}</td>
                  <td className="py-2 text-center text-slate-500">{free}</td>
                  <td className="py-2 text-center font-bold text-pink-200">{prem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bảng giá */}
        <div className="space-y-3">
          <h2 className="text-lg font-extrabold text-white text-center">
            {active ? t("premium.select_plan_extend", locale) : t("premium.select_plan", locale)}
          </h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {PLAN_ORDER.map((pid) => {
              const p = plans[pid];
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
                      {t("premium.best_deal", locale)}
                    </span>
                  ) : null}
                  <p className="text-sm font-bold text-pink-200">{p.label}</p>
                  <p className="text-2xl font-black text-white">{fmtVND(p.amount)}{t("premium.currency_suffix", locale)}</p>
                  <p className="text-[11px] text-slate-400 min-h-[28px]">{p.note}</p>
                  <button
                    className={`mt-1 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                      best
                        ? "bg-pink-500 text-white hover:bg-pink-400"
                        : "border border-pink-300/30 text-pink-200 hover:border-pink-300/60"
                    }`}
                  >
                    {active ? t("premium.renew_btn", locale) : t("premium.buy_btn", locale)}
                  </button>
                </form>
              );
            })}
          </div>
          <p className="text-center text-xs text-slate-500">
            {t("premium.payment_desc", locale)}
          </p>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useLanguage } from "./LanguageProvider";

type Review = { name: string; handle?: string; text: string; avatar?: string };

const TESTIMONIALS: Review[] = [];

const TOPGG_REVIEWS = "https://top.gg/bot/1482620714690543738#reviews";

export default function Testimonials() {
  const { t } = useLanguage();
  return (
    <section className="w-full py-16 md:py-20">
      <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
        <h2 className="text-3xl md:text-4xl font-extrabold text-white">{t("testimonials.title")}</h2>
        <p className="text-slate-400 text-sm md:text-base">{t("testimonials.subtitle")}</p>
      </div>

      {TESTIMONIALS.length === 0 ? (
        <div className="max-w-xl mx-auto glass-panel rounded-3xl p-8 text-center border border-dashed border-pink-300/25 space-y-4">
          <span className="text-4xl">🌸</span>
          <h3 className="text-lg font-bold text-white">{t("testimonials.first_title")}</h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            {t("testimonials.first_desc")}
          </p>
          <a
            href={TOPGG_REVIEWS}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-3 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 transition-all duration-300"
          >
            {t("testimonials.write_btn")}
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {TESTIMONIALS.map((r) => (
            <div key={r.name} className="glass-panel rounded-2xl p-5 space-y-3 border border-pink-300/10">
              <p className="text-slate-300 text-sm leading-relaxed">“{r.text}”</p>
              <div className="flex items-center gap-3 pt-3 border-t border-pink-300/10">
                {r.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.avatar} alt={r.name} width={32} height={32} className="rounded-full" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-pink-300/20" />
                )}
                <div>
                  <p className="text-sm font-bold text-white">{r.name}</p>
                  {r.handle ? <p className="text-xs text-slate-500">{r.handle}</p> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

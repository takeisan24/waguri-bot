"use client";

import { useState } from "react";
import { useLanguage } from "./LanguageProvider";

export default function FaqSection() {
  const { t } = useLanguage();
  const [open, setOpen] = useState<number | null>(0);

  const faqs = [
    [t("faq.q1"), t("faq.a1")],
    [t("faq.q2"), t("faq.a2")],
    [t("faq.q3"), t("faq.a3")],
    [t("faq.q4"), t("faq.a4")],
    [t("faq.q5"), t("faq.a5")],
    [t("faq.q6"), t("faq.a6")],
  ];

  return (
    <section className="w-full py-16 md:py-20">
      <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
        <h2 className="text-3xl md:text-4xl font-extrabold text-white">{t("faq.title")}</h2>
        <p className="text-slate-400 text-sm md:text-base">{t("faq.subtitle")}</p>
      </div>
      <div className="max-w-2xl mx-auto space-y-3">
        {faqs.map(([q, a], i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="glass-panel rounded-2xl border border-pink-300/10 overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                aria-expanded={isOpen}
              >
                <span className="font-bold text-white text-sm md:text-base">{q}</span>
                <span className={`text-pink-300 text-xl transition-transform ${isOpen ? "rotate-45" : ""}`}>+</span>
              </button>
              {isOpen ? <p className="px-5 pb-4 text-slate-400 text-sm leading-relaxed">{a}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

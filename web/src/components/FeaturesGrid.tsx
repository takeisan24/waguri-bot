"use client";

import { useLanguage } from "./LanguageProvider";

const feats = [
  { emoji: "💬", titleKey: "home.features.ai_chat_title", descKey: "home.features.ai_chat_desc" },
  { emoji: "💼", titleKey: "home.features.economy_title", descKey: "home.features.economy_desc" },
  { emoji: "🎲", titleKey: "home.features.minigames_title", descKey: "home.features.minigames_desc" },
  { emoji: "🏰", titleKey: "home.features.clans_title", descKey: "home.features.clans_desc" },
];

export default function FeaturesGrid() {
  const { t } = useLanguage();

  return (
    <section id="features" className="w-full py-16 md:py-24 scroll-mt-20">
      <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
        <h2 className="text-3xl md:text-4xl font-extrabold text-white">{t("home.features.title")}</h2>
        <p className="text-slate-400 text-sm md:text-base">{t("home.features.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {feats.map((f) => (
          <div key={f.titleKey} className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col space-y-3">
            <span className="text-3xl">{f.emoji}</span>
            <h3 className="text-lg font-bold text-white">{t(f.titleKey)}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{t(f.descKey)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

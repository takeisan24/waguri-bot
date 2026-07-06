"use client";

import Link from "next/link";
import { useLanguage } from "./LanguageProvider";

/**
 * Client-side hero section that uses i18n for translatable text.
 * Wrapped inside page.tsx (Server Component).
 */
export default function HeroContent() {
  const { t, locale } = useLanguage();

  return (
    <div className="text-center max-w-3xl mx-auto mb-16 space-y-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://media.tenor.com/saOAfF_zx6UAAAAM/kaoruko-waguri-the-fragrant-flower-blooms-with-dignity.gif"
        alt="Waguri Kaoruko"
        width={128}
        height={128}
        loading="lazy"
        className="mx-auto w-28 h-28 rounded-full border-2 border-pink-300/40 object-cover shadow-[0_0_45px_rgba(255,183,197,0.35)]"
      />
      <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full border border-pink-300/20 bg-pink-500/5 text-pink-300 text-xs font-semibold tracking-wide backdrop-blur-md">
        <span>{t("home.hero.badge")}</span>
      </div>

      <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight">
        {locale === "en" ? (
          <>
            Level Up Your Server with{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-rose-300 to-purple-400 text-glow">
              Waguri
            </span>
          </>
        ) : (
          <>
            Nâng tầm Server của bạn cùng{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-rose-300 to-purple-400 text-glow">
              Waguri
            </span>
          </>
        )}
      </h1>

      <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
        {t("home.hero.subtitle")}
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
        <a
          href="https://discord.com/oauth2/authorize?client_id=1482620714690543738&permissions=1099512007760&integration_type=0&scope=bot+applications.commands"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full sm:w-auto px-8 py-4 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 shadow-[0_0_30px_rgba(255,183,197,0.35)] hover:shadow-[0_0_35px_rgba(255,183,197,0.55)] transition-all duration-300 transform hover:-translate-y-1 text-center cursor-pointer"
        >
          {t("home.hero.invite_btn")}
        </a>
        <a
          href="#features"
          className="w-full sm:w-auto px-8 py-4 rounded-full font-bold border border-slate-700 text-slate-300 hover:text-white hover:border-pink-300/50 bg-[#120c1a]/30 backdrop-blur-md transition-all duration-300 text-center cursor-pointer"
        >
          {locale === "en" ? "Explore Features" : "Khám Phá Tính Năng"}
        </a>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "./LanguageProvider";

const VOTE_URL = "https://top.gg/bot/1482620714690543738/vote";

export default function SiteFooter() {
  const { t, locale } = useLanguage();

  const devByText = locale === "en" ? "Developed by" : "Phát triển bởi";
  const disclaimerText = locale === "en"
    ? 'Inspired by the character Waguri Kaoruko from "The Fragrant Flower Blooms with Dignity". This is a fan product, not officially affiliated with the author/publisher and does not own character rights.'
    : 'Lấy cảm hứng từ nhân vật Waguri Kaoruko trong "The Fragrant Flower Blooms with Dignity". Đây là sản phẩm fan, không có liên kết chính thức với tác giả/nhà xuất bản và không sở hữu bản quyền nhân vật.';

  return (
    <footer className="relative border-t border-slate-900 bg-[#07040a]/80 py-8 z-10 text-xs text-slate-500">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-5">
        <div className="flex flex-col items-center md:items-start gap-1.5">
          <span className="text-sm font-extrabold tracking-wider text-pink-300">WAGURI 🌸</span>
          <p>{t("footer.desc")}</p>
          <p>
            {devByText}{" "}
            <a
              href="https://bio.link/takeisan204"
              target="_blank"
              rel="noopener noreferrer"
              className="text-pink-300 hover:underline font-semibold"
            >
              takei
            </a>
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px]">
          <a href={VOTE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-pink-300 transition-colors">
            Vote Top.gg
          </a>
          <Link href="/wiki" className="hover:text-pink-300 transition-colors">{t("nav.wiki")}</Link>
          <Link href="/leaderboard" className="hover:text-pink-300 transition-colors">{t("nav.leaderboard")}</Link>
          <Link href="/tos" className="hover:text-pink-300 transition-colors">{t("footer.tos")}</Link>
          <Link href="/privacy" className="hover:text-pink-300 transition-colors">{t("footer.privacy")}</Link>
          <a href="https://discord.gg/zbJ4SBaMhE" target="_blank" rel="noopener noreferrer" className="hover:text-pink-300 transition-colors">
            {t("footer.support")}
          </a>
        </div>
        <p>&copy; {new Date().getFullYear()} Waguri</p>
      </div>
      <div className="max-w-7xl mx-auto px-6 mt-5 pt-4 border-t border-slate-900/60">
        <p className="text-[11px] text-slate-600 text-center leading-relaxed">
          {disclaimerText}
        </p>
      </div>
    </footer>
  );
}

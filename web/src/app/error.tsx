"use client";

import Link from "next/link";
import { useLanguage } from "../components/LanguageProvider";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0d0812] text-slate-200 px-6 text-center gap-5">
      <div className="text-5xl">🥺</div>
      <h1 className="text-2xl font-black text-white">{t("error.title")}</h1>
      <p className="text-slate-400 max-w-sm">{t("error.desc")}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="px-6 py-3 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 transition-all"
        >
          {t("error.retry")}
        </button>
        <Link href="/" className="px-6 py-3 rounded-full font-bold border border-pink-300/30 text-pink-200 hover:border-pink-300/60 transition-all">
          {t("error.back_home")}
        </Link>
      </div>
    </div>
  );
}

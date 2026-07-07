import Link from "next/link";
import CherryBlossom from "../components/CherryBlossom";
import { getLocaleServer, t } from "../lib/i18n";

export default async function NotFound() {
  const locale = await getLocaleServer();

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-[#0d0812] text-slate-200 px-6 text-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-pink-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[70%] rounded-full bg-purple-600/10 blur-[130px]" />
      </div>
      <CherryBlossom />
      <div className="relative z-10 space-y-5">
        <div className="text-6xl">🌸</div>
        <h1 className="text-4xl font-black text-white">{t("notfound.title", locale)}</h1>
        <p className="text-slate-400 max-w-sm mx-auto">
          {t("notfound.desc", locale)}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link href="/" className="px-6 py-3 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 transition-all">
            {t("notfound.back_home", locale)}
          </Link>
          <Link href="/commands" className="px-6 py-3 rounded-full font-bold border border-pink-300/30 text-pink-200 hover:border-pink-300/60 transition-all">
            {t("notfound.view_commands", locale)}
          </Link>
        </div>
      </div>
    </div>
  );
}

import { getLocaleServer, t } from "../lib/i18n";

export default async function Loading() {
  const locale = await getLocaleServer();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0d0812] text-pink-300 gap-4">
      <div className="text-4xl animate-float">🌸</div>
      <p className="text-sm text-slate-400">{t("common.loading", locale)}</p>
    </div>
  );
}

import React from "react";
import CherryBlossom from "../../components/CherryBlossom";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { getLocaleServer } from "../../lib/i18n";
import changelogs from "../../data/changelogs.json";

export async function generateMetadata() {
  const locale = await getLocaleServer();
  return {
    title: `${locale === "en" ? "Changelog History" : "Lịch Sử Bản Vá"} — Waguri`,
    description: locale === "en" 
      ? "Full timeline history of updates, fixes, and improvements of Waguri Bot." 
      : "Lịch sử cập nhật, sửa lỗi và cải tiến tính năng của Waguri Bot.",
    robots: { index: true },
  };
}

export default async function ChangelogPage() {
  const locale = await getLocaleServer();
  const isEn = locale === "en";

  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-x-hidden bg-[#0d0812] text-slate-200">
      {/* Background decoration gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-pink-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[70%] rounded-full bg-purple-600/10 blur-[130px]" />
      </div>

      {/* Cherry Blossom falling petals effect */}
      <CherryBlossom />

      <SiteHeader />

      {/* Main Content */}
      <main className="relative flex-1 flex flex-col items-center px-6 z-10 py-10 max-w-4xl mx-auto w-full">
        {/* Title Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-black text-white mb-3">
            {isEn ? "🔨 Changelog History" : "🔨 Nhật Ký Cập Nhật"}
          </h1>
          <p className="text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
            {isEn
              ? "Follow the development progress of Waguri Bot - detailing features, balancing adjustments, and bug fixes."
              : "Theo dõi tiến độ hoàn thiện của Waguri Bot qua các giai đoạn - từ tính năng mới, chỉnh sửa cân bằng cho tới vá lỗi."}
          </p>
        </div>

        {/* Timeline Container */}
        <div className="relative w-full border-l-2 border-pink-500/20 pl-6 ml-4 md:ml-6 space-y-12">
          {changelogs.map((item, idx) => {
            const borderColors = {
              pink: "border-pink-500/40 text-pink-300 bg-pink-500/10 shadow-[0_0_15px_rgba(244,63,94,0.15)]",
              purple: "border-purple-500/40 text-purple-300 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.15)]",
              blue: "border-blue-500/40 text-blue-300 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.15)]",
              green: "border-green-500/40 text-green-300 bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.15)]"
            };
            const activeColors = {
              pink: "bg-pink-500 shadow-[0_0_10px_#f43f5e]",
              purple: "bg-purple-500 shadow-[0_0_10px_#a855f7]",
              blue: "bg-blue-500 shadow-[0_0_10px_#3b82f6]",
              green: "bg-green-500 shadow-[0_0_10px_#22c55e]"
            };

            const tagColorClass = borderColors[item.tagColor as keyof typeof borderColors] || borderColors.pink;
            const glowDotClass = activeColors[item.tagColor as keyof typeof activeColors] || activeColors.pink;

            return (
              <div key={idx} className="relative group">
                {/* Glowing Dot on vertical axis */}
                <div className={`absolute -left-[33px] top-2.5 w-3.5 h-3.5 rounded-full z-20 transition-all duration-300 group-hover:scale-125 ${glowDotClass}`} />
                
                {/* Main Card */}
                <div className="glass-panel p-6 rounded-2xl border border-pink-300/10 transition-all duration-300 group-hover:translate-x-1 group-hover:border-pink-300/20 group-hover:bg-[#140c1a]/70 shadow-lg">
                  {/* Header Row */}
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-500/10 text-pink-200 border border-pink-300/10">
                      {item.date}
                    </span>
                    {item.tag && (
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${tagColorClass}`}>
                        {item.tag}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h2 className="text-xl font-bold text-white mb-4 group-hover:text-pink-300 transition-colors">
                    {isEn ? item.title_en : item.title_vi}
                  </h2>

                  {/* Bullet list of updates */}
                  <ul className="space-y-3.5 text-slate-300 text-sm md:text-base pl-1">
                    {(isEn ? item.details_en : item.details_vi).map((detail, dIdx) => {
                      const parts = detail.split("**");
                      return (
                        <li key={dIdx} className="flex gap-2 items-start leading-relaxed">
                          <span className="text-pink-400 mt-1 select-none text-xs">✨</span>
                          <span className="text-slate-300 font-sans text-xs md:text-sm">
                            {parts.map((part, pIdx) =>
                              pIdx % 2 === 1 ? (
                                <strong key={pIdx} className="text-white font-extrabold">{part}</strong>
                              ) : (
                                part
                              )
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

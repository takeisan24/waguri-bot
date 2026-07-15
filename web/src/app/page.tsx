import React from "react";
import Link from "next/link";
import CherryBlossom from "../components/CherryBlossom";
import DiscordMockup from "../components/DiscordMockup";
import LiveStats from "../components/LiveStats";
import LeaderboardTeaser from "../components/LeaderboardTeaser";
import FaqSection from "../components/FaqSection";
import Testimonials from "../components/Testimonials";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import EventBanner from "../components/EventBanner";
import { getLocalizedPlans, PLAN_ORDER } from "../lib/premium";
import { createAdminClient } from "../lib/supabase/admin";
import WaguriFloat from "../components/WaguriFloat";
import HeroContent from "../components/HeroContent";
import FeaturesGrid from "../components/FeaturesGrid";
import { getLocaleServer } from "../lib/i18n";
import changelogs from "../data/changelogs.json";

export default async function Home() {
  const locale = await getLocaleServer();
  const isEn = locale === "en";
  const plans = getLocalizedPlans(locale);
  let latestAnnouncement = "";
  const hasUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const hasKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (hasUrl && hasKey) {
    try {
      const supabase = createAdminClient();
      const { data } = await supabase.from('guild_settings').select('settings').eq('guild_id', 'global').single();
      latestAnnouncement = data?.settings?.latest_announcement || "";
    } catch (err) {
      console.error('[NEXTJS DB ERROR] Fetching global announcement:', err);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Waguri",
            applicationCategory: "GameApplication",
            operatingSystem: "Discord",
            description: "Discord bot kinh tế · nhập vai · AI waifu bản địa hóa Việt Nam.",
            url: "https://waguri-bot.vercel.app",
            inLanguage: "vi",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }),
        }}
      />
      {/* Background decoration gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-pink-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[70%] rounded-full bg-purple-600/10 blur-[130px]" />
        <div className="absolute top-[30%] right-[20%] w-[40%] h-[50%] rounded-full bg-pink-600/5 blur-[100px]" />
        {/* Hoa sakura trang trí (SVG nguyên bản, an toàn bản quyền) */}
        <div className="absolute top-[12%] left-[6%] w-16 h-16 bg-[url('/sakura.svg')] bg-contain bg-no-repeat opacity-20 animate-float" />
        <div className="absolute top-[26%] right-[8%] w-10 h-10 bg-[url('/sakura.svg')] bg-contain bg-no-repeat opacity-[0.15] animate-float" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-[9%] right-[30%] w-7 h-7 bg-[url('/sakura.svg')] bg-contain bg-no-repeat opacity-10 animate-float" style={{ animationDelay: "3s" }} />
      </div>

      {/* Cherry Blossom falling petals effect */}
      <CherryBlossom />

      {/* Navigation Header */}
      <SiteHeader />

      {/* Hero Section */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-6 z-10 py-12 md:py-20 max-w-7xl mx-auto w-full">
        <div className="w-full max-w-3xl mx-auto mb-6">
          <EventBanner />
        </div>
        <HeroContent />

          {/* Số liệu live (ẩn nếu bot offline / chưa mở cổng) */}
          <LiveStats />

        {/* Bản Tin Cập Nhật / Announcements */}
        <section id="announcements" className="w-full max-w-4xl mx-auto py-8 md:py-12 scroll-mt-20">
          <div className="glass-panel p-6 md:p-8 rounded-3xl border border-pink-300/15 relative overflow-hidden shadow-2xl">
            {/* Gradient glow */}
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-pink-500/10 blur-3xl pointer-events-none" />
            
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">📢</span>
              <h2 className="text-xl md:text-2xl font-black text-white">
                {isEn ? "Waguri Bot News & Updates" : "Bản Tin Cập Nhật Waguri Bot"}
              </h2>
            </div>

            <div className="space-y-6">
              {/* Dynamic Latest Announcement */}
              {latestAnnouncement && (
                <div className="border-l-2 border-pink-300/60 pl-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-500/20 text-pink-200 border border-pink-300/10">
                      {isEn ? "Latest" : "Mới Nhất"}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      {isEn ? "Most recent update from Bot" : "Bản cập nhật gần đây nhất từ Bot"}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white">
                    {isEn ? "⚙️ Automated Update Channel" : "⚙️ Bản Tin Cập Nhật Tự Động"}
                  </h3>
                  <div className="text-xs md:text-sm text-slate-300 whitespace-pre-line leading-relaxed bg-pink-500/5 border border-pink-300/5 p-4 rounded-xl shadow-inner font-sans">
                    {latestAnnouncement}
                  </div>
                </div>
              )}

              {changelogs.slice(0, 2).map((item, idx) => {
                const borderColors = {
                  pink: "border-pink-500/40 text-pink-300 bg-pink-500/10",
                  purple: "border-purple-500/40 text-purple-300 bg-purple-500/10",
                  blue: "border-blue-500/40 text-blue-300 bg-blue-500/10",
                  green: "border-green-500/40 text-green-300 bg-green-500/10"
                };
                const tagColorClass = borderColors[item.tagColor as keyof typeof borderColors] || borderColors.pink;

                return (
                  <div key={idx} className="border-l-2 border-slate-700 pl-4 space-y-2 opacity-90 hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-500/10 text-pink-200 border border-pink-300/10">
                        {item.date}
                      </span>
                      {item.tag && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${tagColorClass}`}>
                          {item.tag}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-white">
                      {isEn ? item.title_en : item.title_vi}
                    </h3>
                    <ul className="text-xs md:text-sm text-slate-300 space-y-1.5 list-disc pl-4">
                      {(isEn ? item.details_en : item.details_vi).map((detail, dIdx) => {
                        const parts = detail.split("**");
                        return (
                          <li key={dIdx}>
                            {parts.map((part, pIdx) => 
                              pIdx % 2 === 1 ? <strong key={pIdx} className="text-white">{part}</strong> : part
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 pt-4 border-t border-pink-300/10 text-center">
              <Link
                href="/changelog"
                className="inline-flex items-center gap-1.5 text-xs md:text-sm font-bold text-pink-400 hover:text-pink-300 transition-all hover:translate-x-1 duration-200"
              >
                {isEn ? "View full changelog history →" : "Xem toàn bộ lịch sử các bản vá →"}
              </Link>
            </div>
          </div>
        </section>

        {/* Live Discord Interactive Demo Section */}
        <section id="commands" className="w-full py-8 md:py-12 scroll-mt-20">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-2">
              {isEn ? "Interactive Chat Demo" : "Trải Nghiệm Trực Quan"}
            </h2>
            <p className="text-slate-400 text-sm">
              {isEn 
                ? "Click the command buttons below the chat box to try interacting with Waguri!" 
                : "Nhấp vào các nút lệnh bên dưới khung chat để thử tương tác cùng Waguri nhé!"}
            </p>
          </div>
          <DiscordMockup />
        </section>

        {/* Feature Grid Section */}
        <FeaturesGrid />

        {/* Đặc sản Việt */}
        <section className="w-full py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">
              {isEn ? "Vietnamese Culture Localized 🌸" : "Đậm Chất Việt Nam 🌸"}
            </h2>
            <p className="text-slate-400 text-sm md:text-base">
              {isEn 
                ? "Unique systems designed for Vietnamese community — unlike Mee6 or Dank Memer." 
                : "Những thứ chỉ Waguri mới có — không đụng hàng Mee6 hay Dank Memer."}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {(isEn ? [
              ["🗓️", "Lunar Calendar & Fortune Telling", "Check lunar dates, stem-branch, auspicious hours, and daily fortune telling."],
              ["🐷", "Piggy Bank Breeding", "Buy piglets, feed them, sell for profit — or raid friends' piggies!"],
              ["🌱", "Time-based Farming", "Sow seeds, water them, and harvest agricultural crops in real-time."],
              ["🧧", "Lucky Red Envelopes", "Distribute lucky money to the text channel — fastest hands win the most."],
              ["🎱", "Voice Loto & Bingo", "Open a room in voice channel, automate number calling, and play with groups."],
              ["🏰", "Clans & Alliance Wars", "Form a clan, contribute funds, and declare PvP wars to seize enemy treasuries."],
            ] : [
              ["🗓️", "Lịch âm & Bói vui", "Xem âm lịch, can-chi, giờ hoàng đạo và bói toán mỗi ngày."],
              ["🐷", "Nuôi heo đất", "Mua heo, chăm bẵm, bán kiếm lời — hoặc rình trộm heo bạn bè!"],
              ["🌱", "Trồng cây", "Gieo giống, tưới nước, thu hoạch nông sản theo thời gian thực."],
              ["🧧", "Lì xì may mắn", "Phát lì xì cho cả kênh — ai nhanh tay người đó hưởng nhiều."],
              ["🎱", "Loto & Bingo voice", "Mở phòng trong kênh thoại, máy tự gọi số, chơi cả nhóm."],
              ["🏰", "Bang hội & Đại chiến", "Lập bang, góp quỹ, tuyên chiến PvP cướp quỹ bang địch."],
            ]).map(([icon, title, desc]) => (
              <div key={title as string} className="glass-panel glass-panel-hover p-5 rounded-2xl space-y-2">
                <span className="text-2xl">{icon}</span>
                <h3 className="text-base font-bold text-white">{title}</h3>
                <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Cách bắt đầu */}
        <section className="w-full py-12 md:py-16">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">
              {isEn ? "Get Started in 30 Seconds" : "Bắt đầu trong 30 giây"}
            </h2>
            <p className="text-slate-400 text-sm md:text-base">
              {isEn ? "Three simple steps to start your economic journey with Waguri." : "Ba bước đơn giản để lên đường làm giàu cùng Waguri."}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {(isEn ? [
              ["1", "Invite Waguri", "Add the bot to your Discord server with just a single click."],
              ["2", "Type /start", "Initialize your character profile and claim a startup starter package."],
              ["3", "Use /daily", "Daily check-in, work, play minigames, and climb the leaderboard!"],
            ] : [
              ["1", "Mời Waguri", "Thêm bot vào server Discord của bạn chỉ với một cú nhấp."],
              ["2", "Gõ /start", "Tạo nhân vật và nhận ngay quà chào mừng khởi nghiệp."],
              ["3", "/daily mỗi ngày", "Điểm danh nhận thưởng, đi làm, chơi minigame và leo top!"],
            ]).map(([n, title, desc]) => (
              <div key={n} className="glass-panel rounded-2xl p-6 text-center space-y-2.5">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-pink-300 text-[#0d0812] font-black text-lg">{n}</span>
                <h3 className="text-base font-bold text-white">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Top đại gia (live) */}
        <LeaderboardTeaser />

        {/* Premium teaser */}
        <section id="premium" className="w-full py-16 md:py-20 scroll-mt-20">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">
              Waguri Premium 💎
            </h2>
            <p className="text-slate-400 text-sm md:text-base">
              {isEn ? "Unlock all premium features at an affordable price — support Waguri's development 🌸" : "Mở khoá toàn bộ quyền lợi với giá mềm — ủng hộ Waguri phát triển 🌸"}
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 max-w-3xl mx-auto mb-6">
            {(isEn ? [
              ["💬", "150 AI Chats per day"],
              ["💰", "+10% income boost on all commands"],
              ["💎", "Exclusive Premium profile badge"],
              ["✨", "Early access to new features"],
            ] : [
              ["💬", "150 lượt chat AI / ngày"],
              ["💰", "+10% thu nhập mọi lệnh"],
              ["💎", "Huy hiệu Premium nổi bật"],
              ["✨", "Ưu tiên tính năng mới"],
            ]).map(([icon, t]) => (
              <div key={t} className="flex items-center gap-3 glass-panel rounded-xl p-3 border border-pink-300/10">
                <span className="text-xl">{icon}</span>
                <span className="text-sm text-slate-200 font-medium">{t}</span>
              </div>
            ))}
          </div>
          <div className="grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {PLAN_ORDER.map((pid) => {
              const p = plans[pid];
              const best = pid === "m6";
              return (
                <div
                  key={pid}
                  className={`relative glass-panel rounded-2xl p-5 text-center flex flex-col gap-1.5 border ${
                    best ? "border-pink-400/50 ring-1 ring-pink-400/30" : "border-pink-300/10"
                  }`}
                >
                  {best ? (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-pink-500 text-[10px] font-black text-white">
                      {isEn ? "BEST VALUE" : "ĐÁNG MUA NHẤT"}
                    </span>
                  ) : null}
                  <p className="text-sm font-bold text-pink-200">{p.label}</p>
                  <p className="text-2xl font-black text-white">{p.amount.toLocaleString("vi-VN")}đ</p>
                  <p className="text-[11px] text-slate-400 min-h-[28px]">{p.note}</p>
                </div>
              );
            })}
          </div>
          <div className="text-center mt-6">
            <Link
              href="/dashboard/premium"
              className="inline-block px-8 py-3.5 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 shadow-[0_0_30px_rgba(255,183,197,0.3)] transition-all duration-300"
            >
              {isEn ? "Upgrade to Premium 💎" : "Nâng cấp Premium 💎"}
            </Link>
          </div>
        </section>

        {/* Đánh giá cộng đồng (khung sẵn) */}
        <Testimonials />

        {/* FAQ */}
        <FaqSection />

        {/* Call to action card */}
        <section className="w-full py-12 md:py-16">
          <div className="relative glass-panel rounded-3xl p-8 md:p-12 overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8 border border-pink-300/20 shadow-[0_0_50px_rgba(255,183,197,0.05)]">
            <div className="absolute top-[-50%] right-[-10%] w-[350px] h-[350px] rounded-full bg-pink-500/10 blur-[80px] pointer-events-none" />
            <div className="space-y-4 max-w-xl text-center md:text-left relative z-10">
              <h2 className="text-2xl md:text-3xl font-extrabold text-white">
                {isEn ? "Bring Waguri's smile to your server!" : "Hãy mang nụ cười của Waguri về server!"}
              </h2>
              <p className="text-slate-400 text-sm md:text-base leading-relaxed">
                {isEn 
                  ? "Play, chat, and build your empire from scratch with a growing community. 100% free, set up in just 3 seconds!"
                  : "Cùng cộng đồng đang lớn dần mỗi ngày chơi đùa, trò chuyện và cùng nhau đi lên từ bàn tay trắng. Hoàn toàn miễn phí, cài đặt chỉ trong 3 giây!"}
              </p>
            </div>
            <div className="relative z-10 flex-shrink-0">
              <a
                href="https://discord.com/oauth2/authorize?client_id=1482620714690543738&permissions=1099512007760&integration_type=0&scope=bot+applications.commands"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 shadow-[0_0_30px_rgba(255,183,197,0.3)] transition-all duration-300 transform hover:-translate-y-0.5 inline-block text-center cursor-pointer"
              >
                {isEn ? "Invite Waguri 🌸" : "Mời Waguri 🌸"}
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <WaguriFloat />
    </div>
  );
}

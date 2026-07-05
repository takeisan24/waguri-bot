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
import { PREMIUM_PLANS, PLAN_ORDER } from "../lib/premium";
import { createAdminClient } from "../lib/supabase/admin";
import WaguriFloat from "../components/WaguriFloat";

export default async function Home() {
  const supabase = createAdminClient();
  let latestAnnouncement = "";
  try {
    const { data } = await supabase.from('guild_settings').select('settings').eq('guild_id', 'global').single();
    latestAnnouncement = data?.settings?.latest_announcement || "";
  } catch (err) {
    console.error('[NEXTJS DB ERROR] Fetching global announcement:', err);
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
            <span>🌸 Bạn gái AI waifu & Quản gia kinh tế RPG</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight">
            Nâng tầm Server của bạn cùng{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-rose-300 to-purple-400 text-glow">
              Waguri
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Một cô bạn AI waifu dịu dàng biết trò chuyện tâm sự, vừa là game kinh tế nhập vai đậm chất Việt Nam (đi làm, mở nghề, minigame may rủi, lì xì, bang hội...) cực kỳ vui nhộn ngay trên Discord!
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <a
              href="https://discord.com/oauth2/authorize?client_id=1482620714690543738&permissions=1099512007760&integration_type=0&scope=bot+applications.commands"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-8 py-4 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 shadow-[0_0_30px_rgba(255,183,197,0.35)] hover:shadow-[0_0_35px_rgba(255,183,197,0.55)] transition-all duration-300 transform hover:-translate-y-1 text-center cursor-pointer"
            >
              Mời Waguri 🌸
            </a>
            <a
              href="#features"
              className="w-full sm:w-auto px-8 py-4 rounded-full font-bold border border-slate-700 text-slate-300 hover:text-white hover:border-pink-300/50 bg-[#120c1a]/30 backdrop-blur-md transition-all duration-300 text-center cursor-pointer"
            >
              Khám Phá Tính Năng
            </a>
          </div>

          {/* Số liệu live (ẩn nếu bot offline / chưa mở cổng) */}
          <LiveStats />
        </div>

        {/* Bản Tin Cập Nhật / Announcements */}
        <section id="announcements" className="w-full max-w-4xl mx-auto py-8 md:py-12 scroll-mt-20">
          <div className="glass-panel p-6 md:p-8 rounded-3xl border border-pink-300/15 relative overflow-hidden shadow-2xl">
            {/* Gradient glow */}
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-pink-500/10 blur-3xl pointer-events-none" />
            
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">📢</span>
              <h2 className="text-xl md:text-2xl font-black text-white">Bản Tin Cập Nhật Waguri Bot</h2>
            </div>

            <div className="space-y-6">
              {/* Dynamic Latest Announcement */}
              {latestAnnouncement && (
                <div className="border-l-2 border-pink-300/60 pl-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-500/20 text-pink-200 border border-pink-300/10">Mới Nhất</span>
                    <span className="text-xs text-slate-400 font-medium">Bản cập nhật gần đây nhất từ Bot</span>
                  </div>
                  <h3 className="text-base font-bold text-white">⚙️ Bản Tin Cập Nhật Tự Động</h3>
                  <div className="text-xs md:text-sm text-slate-300 whitespace-pre-line leading-relaxed bg-pink-500/5 border border-pink-300/5 p-4 rounded-xl shadow-inner font-sans">
                    {latestAnnouncement}
                  </div>
                </div>
              )}

              {/* Update 1 */}
              <div className="border-l-2 border-slate-700 pl-4 space-y-2 opacity-80">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-500/10 text-pink-200 border border-pink-300/10">05/07/2026</span>
                </div>
                <h3 className="text-base font-bold text-white">Đợt 1: Gộp Lệnh Tiện Lợi & Vá Lỗ Hổng Pet</h3>
                <ul className="text-xs md:text-sm text-slate-300 space-y-1.5 list-disc pl-4">
                  <li><strong>Tái cấu trúc UX:</strong> Gộp 15 lệnh thành 6 lệnh hợp nhất: <code>/image</code>, <code>/action</code>, <code>/couple</code>, <code>/store</code>, <code>/bank</code>, <code>/bot</code> giúp menu lệnh mượt mà, dễ cày cuốc.</li>
                  <li><strong>Thú cưng trỗi dậy:</strong> Mở khoá passive skill cấp 5+ cho Rồng con (+15% EXP), Cáo nhỏ (+10% trộm & giảm phạt), Thỏ con (giảm 15% năng lượng), Gấu con (+10% sản lượng & tăng giá bán).</li>
                  <li><strong>AI thông minh hơn:</strong> Waguri giờ đã tự động hiểu nghề nghiệp, tên/loài pet, tiệm bánh, và sức khỏe thực tế của bạn khi chat.</li>
                  <li><strong>Thông báo tự động:</strong> Tích hợp cấu hình kênh cập nhật <code>/config announcement-channel</code> để tự động nhận tin tức từ dev.</li>
                </ul>
              </div>

              {/* Update 2 */}
              <div className="border-l-2 border-slate-700 pl-4 space-y-2 opacity-80">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-200 border border-purple-300/10">04/07/2026</span>
                </div>
                <h3 className="text-base font-bold text-white">Vận Hành Tiệm Bánh Gekka & Thuê Nhân Viên</h3>
                <ul className="text-xs md:text-sm text-slate-300 space-y-1.5 list-disc pl-4">
                  <li><strong>Thuê bạn bè Waguri làm thợ:</strong> Thuê Rintaro, Subaru, Usami, Saku, Ayato, Madoka làm nhân viên phụ tiệm bánh.</li>
                  <li><strong>Đồ trang trí tiệm bánh:</strong> Chế tạo Bộ nội thất gỗ, Trang sức đá quý để tăng tốc độ nướng bánh thụ động.</li>
                  <li><strong>Tặng quà tăng thiện cảm:</strong> Mua bó hoa, hộp quà, gấu bông để tặng Waguri tăng điểm thân thiết.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Live Discord Interactive Demo Section */}
        <section id="commands" className="w-full py-8 md:py-12 scroll-mt-20">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-2">Trải Nghiệm Trực Quan</h2>
            <p className="text-slate-400 text-sm">Nhấp vào các nút lệnh bên dưới khung chat để thử tương tác cùng Waguri nhé!</p>
          </div>
          <DiscordMockup />
        </section>

        {/* Feature Grid Section */}
        <section id="features" className="w-full py-16 md:py-24 scroll-mt-20">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">Tính Năng Nổi Bật</h2>
            <p className="text-slate-400 text-sm md:text-base">Waguri sở hữu hệ thống trò chơi nhập vai cực kỳ phong phú và cân bằng sâu sắc.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col space-y-3">
              <span className="text-3xl">💬</span>
              <h3 className="text-lg font-bold text-white">Bạn Gái AI Trò Chuyện</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Persona ngọt ngào, dịu dàng lấy cảm hứng từ Waguri Kaoruko. Chat thông minh qua Gemini API, hỗ trợ ghi nhớ ngữ cảnh trò chuyện linh hoạt.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col space-y-3">
              <span className="text-3xl">💼</span>
              <h3 className="text-lg font-bold text-white">Kinh Tế Nhập Vai Việt</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Hơn 70 lệnh đi làm kiếm tiền, mua sắm vật phẩm. Đăng ký nghề nghiệp thực tế: bán trà đá vỉa hè, chạy xe ôm, đầu bếp tiệm Gekka, hay đại gia.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col space-y-3">
              <span className="text-3xl">⚡</span>
              <h3 className="text-lg font-bold text-white">Thể Lực & Mệt Mỏi</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Hệ thống năng lượng giới hạn lượt cày cuốc. Mức độ mệt mỏi tăng cao nếu làm việc quá sức làm giảm thu nhập thực tế, chống lạm phát tối đa.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col space-y-3">
              <span className="text-3xl">🎲</span>
              <h3 className="text-lg font-bold text-white">Minigame May Rủi Đa Dạng</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Tài Xỉu, Bầu Cua, Coinflip, Blackjack, Ba Cây. Đặc biệt là Loto và Bingo chơi nhiều người ngay trong phòng voice, máy tự gọi số trực tiếp.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col space-y-3">
              <span className="text-3xl">🏰</span>
              <h3 className="text-lg font-bold text-white">Bang Hội & Đại Chiến</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Thành lập bang hội, nộp quỹ xây dựng thế lực. Kích hoạt chiến tranh bang phái PvP cướp tiền quỹ của bang đối thủ cực kịch tính.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col space-y-3">
              <span className="text-3xl">🏦</span>
              <h3 className="text-lg font-bold text-white">Tài Chính & Vay Nợ</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Gửi tiết kiệm ngân hàng có giới hạn lãi suất. Chuyển tiền P2P tiện lợi, hệ thống vay nợ có kỳ hạn và cưỡng chế đòi nợ tự động.
              </p>
            </div>
          </div>
        </section>

        {/* Đặc sản Việt */}
        <section className="w-full py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">Đậm Chất Việt Nam 🌸</h2>
            <p className="text-slate-400 text-sm md:text-base">Những thứ chỉ Waguri mới có — không đụng hàng Mee6 hay Dank Memer.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              ["🗓️", "Lịch âm & Bói vui", "Xem âm lịch, can-chi, giờ hoàng đạo và bói toán mỗi ngày."],
              ["🐷", "Nuôi heo đất", "Mua heo, chăm bẵm, bán kiếm lời — hoặc rình trộm heo bạn bè!"],
              ["🌱", "Trồng cây", "Gieo giống, tưới nước, thu hoạch nông sản theo thời gian thực."],
              ["🧧", "Lì xì may mắn", "Phát lì xì cho cả kênh — ai nhanh tay người đó hưởng nhiều."],
              ["🎱", "Loto & Bingo voice", "Mở phòng trong kênh thoại, máy tự gọi số, chơi cả nhóm."],
              ["🏰", "Bang hội & Đại chiến", "Lập bang, góp quỹ, tuyên chiến PvP cướp quỹ bang địch."],
            ].map(([icon, title, desc]) => (
              <div key={title} className="glass-panel glass-panel-hover p-5 rounded-2xl space-y-2">
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
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">Bắt đầu trong 30 giây</h2>
            <p className="text-slate-400 text-sm md:text-base">Ba bước đơn giản để lên đường làm giàu cùng Waguri.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {[
              ["1", "Mời Waguri", "Thêm bot vào server Discord của bạn chỉ với một cú nhấp."],
              ["2", "Gõ /start", "Tạo nhân vật và nhận ngay quà chào mừng khởi nghiệp."],
              ["3", "/daily mỗi ngày", "Điểm danh nhận thưởng, đi làm, chơi minigame và leo top!"],
            ].map(([n, title, desc]) => (
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
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">Waguri Premium 💎</h2>
            <p className="text-slate-400 text-sm md:text-base">Mở khoá toàn bộ quyền lợi với giá mềm — ủng hộ Waguri phát triển 🌸</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 max-w-3xl mx-auto mb-6">
            {[
              ["💬", "150 lượt chat AI / ngày"],
              ["💰", "+10% thu nhập mọi lệnh"],
              ["💎", "Huy hiệu Premium nổi bật"],
              ["✨", "Ưu tiên tính năng mới"],
            ].map(([icon, t]) => (
              <div key={t} className="flex items-center gap-3 glass-panel rounded-xl p-3 border border-pink-300/10">
                <span className="text-xl">{icon}</span>
                <span className="text-sm text-slate-200 font-medium">{t}</span>
              </div>
            ))}
          </div>
          <div className="grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {PLAN_ORDER.map((pid) => {
              const p = PREMIUM_PLANS[pid];
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
                      ĐÁNG MUA NHẤT
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
              Nâng cấp Premium 💎
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
              <h2 className="text-2xl md:text-3xl font-extrabold text-white">Hãy mang nụ cười của Waguri về server!</h2>
              <p className="text-slate-400 text-sm md:text-base leading-relaxed">
                Cùng cộng đồng đang lớn dần mỗi ngày chơi đùa, trò chuyện và cùng nhau đi lên từ bàn tay trắng. Hoàn toàn miễn phí, cài đặt chỉ trong 3 giây!
              </p>
            </div>
            <div className="relative z-10 flex-shrink-0">
              <a
                href="https://discord.com/oauth2/authorize?client_id=1482620714690543738&permissions=1099512007760&integration_type=0&scope=bot+applications.commands"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 shadow-[0_0_30px_rgba(255,183,197,0.3)] transition-all duration-300 transform hover:-translate-y-0.5 inline-block text-center cursor-pointer"
              >
                Mời Waguri 🌸
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

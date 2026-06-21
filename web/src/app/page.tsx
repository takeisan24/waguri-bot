import React from "react";
import Link from "next/link";
import CherryBlossom from "../components/CherryBlossom";
import DiscordMockup from "../components/DiscordMockup";
import LiveStats from "../components/LiveStats";

const BOT_ID = "1482620714690543738";
const TOPGG_VOTE_URL = `https://top.gg/bot/${BOT_ID}/vote`;

export default function Home() {
  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812]">
      {/* Background decoration gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-pink-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[70%] rounded-full bg-purple-600/10 blur-[130px]" />
        <div className="absolute top-[30%] right-[20%] w-[40%] h-[50%] rounded-full bg-pink-600/5 blur-[100px]" />
      </div>

      {/* Cherry Blossom falling petals effect */}
      <CherryBlossom />

      {/* Navigation Header */}
      <header className="sticky top-0 w-full bg-[#0d0812]/80 backdrop-blur-md border-b border-pink-300/10 z-30 transition-all duration-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2 select-none group">
            <span className="text-2xl font-black text-glow tracking-wider text-pink-300 group-hover:scale-105 transition-transform duration-300">
              WAGURI <span className="text-pink-400">🌸</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-pink-300 transition-colors duration-200">Tính Năng</a>
            <a href="#commands" className="hover:text-pink-300 transition-colors duration-200">Trải Nghiệm</a>
            <Link href="/wiki" className="hover:text-pink-300 transition-colors duration-200">Wiki</Link>
            <Link href="/tos" className="hover:text-pink-300 transition-colors duration-200">Điều Khoản</Link>
            <Link href="/privacy" className="hover:text-pink-300 transition-colors duration-200">Bảo Mật</Link>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href={TOPGG_VOTE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-block px-4 py-2.5 rounded-full text-xs font-bold border border-pink-300/30 text-pink-200 hover:text-white hover:border-pink-300/60 bg-pink-500/5 backdrop-blur-md transition-all duration-300 cursor-pointer"
            >
              💝 Vote
            </a>
            <a
              href="https://discord.com/oauth2/authorize?client_id=1482620714690543738&permissions=1099512007760&integration_type=0&scope=bot+applications.commands"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-full text-xs font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 shadow-[0_0_20px_rgba(255,183,197,0.3)] hover:shadow-[0_0_25px_rgba(255,183,197,0.5)] transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer"
            >
              Thêm Vào Discord
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-6 z-10 py-12 md:py-20 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-6">
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
            Một cô bạn AI waifu dịu dàng biết trò chuyện tâm sự, vừa là game kinh tế nhập vai đậm chất Việt Nam (đi làm, mở nghề, cờ bạc, lì xì, bang hội...) cực kỳ vui nhộn ngay trên Discord!
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <a
              href="https://discord.com/oauth2/authorize?client_id=1482620714690543738&permissions=1099512007760&integration_type=0&scope=bot+applications.commands"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-8 py-4 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 shadow-[0_0_30px_rgba(255,183,197,0.35)] hover:shadow-[0_0_35px_rgba(255,183,197,0.55)] transition-all duration-300 transform hover:-translate-y-1 text-center cursor-pointer"
            >
              Mời Waguri Tham Gia 🌸
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
              <h3 className="text-lg font-bold text-white">Minigame Cờ Bạc Đa Dạng</h3>
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

        {/* Call to action card */}
        <section className="w-full py-12 md:py-16">
          <div className="relative glass-panel rounded-3xl p-8 md:p-12 overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8 border border-pink-300/20 shadow-[0_0_50px_rgba(255,183,197,0.05)]">
            <div className="absolute top-[-50%] right-[-10%] w-[350px] h-[350px] rounded-full bg-pink-500/10 blur-[80px] pointer-events-none" />
            <div className="space-y-4 max-w-xl text-center md:text-left relative z-10">
              <h2 className="text-2xl md:text-3xl font-extrabold text-white">Hãy mang nụ cười của Waguri về server!</h2>
              <p className="text-slate-400 text-sm md:text-base leading-relaxed">
                Cùng hàng ngàn thành viên khác chơi đùa, trò chuyện và cùng nhau đi lên từ bàn tay trắng. Hoàn toàn miễn phí, cài đặt chỉ trong 3 giây!
              </p>
            </div>
            <div className="relative z-10 flex-shrink-0">
              <a
                href="https://discord.com/oauth2/authorize?client_id=1482620714690543738&permissions=1099512007760&integration_type=0&scope=bot+applications.commands"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 shadow-[0_0_30px_rgba(255,183,197,0.3)] transition-all duration-300 transform hover:-translate-y-0.5 inline-block text-center cursor-pointer"
              >
                Mời Bot Ngay 🌸
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-slate-900 bg-[#07040a]/80 py-10 z-10 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start space-y-2">
            <span className="text-sm font-extrabold tracking-wider text-pink-300">WAGURI 🌸</span>
            <p className="text-center md:text-left">Made with 🌸 for Vietnamese Discord communities.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-8 text-[13px]">
            <a
              href={TOPGG_VOTE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-pink-300 transition-colors"
            >
              Vote trên Top.gg
            </a>
            <Link href="/wiki" className="hover:text-pink-300 transition-colors">Wiki Hướng Dẫn</Link>
            <Link href="/tos" className="hover:text-pink-300 transition-colors">Điều Khoản Dịch Vụ</Link>
            <Link href="/privacy" className="hover:text-pink-300 transition-colors">Chính Sách Bảo Mật</Link>
            <a
              href="https://discord.gg/zbJ4SBaMhE" // Placeholder for support server
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-pink-300 transition-colors"
            >
              Hỗ Trợ Discord
            </a>
          </div>
          <div>
            <p>&copy; {new Date().getFullYear()} Waguri. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

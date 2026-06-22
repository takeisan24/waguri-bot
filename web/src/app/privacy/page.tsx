import React from "react";
import CherryBlossom from "../../components/CherryBlossom";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

export default function PrivacyPolicy() {
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
        <div className="glass-panel w-full p-8 md:p-12 rounded-2xl border border-pink-300/15 space-y-8 shadow-xl">
          <div className="border-b border-pink-300/10 pb-6">
            <h1 className="text-3xl font-black text-white mb-2">Chính Sách Bảo Mật (Privacy Policy)</h1>
            <p className="text-slate-400 text-xs">Cập nhật lần cuối: Ngày 21 tháng 6 năm 2026</p>
          </div>

          <div className="space-y-6 text-sm md:text-base leading-relaxed text-slate-300">
            <p>
              Quyền riêng tư của bạn là ưu tiên hàng đầu của chúng tôi. Chính sách Bảo mật này giải thích cách <strong>Waguri Discord Bot</strong> (sau đây gọi là &quot;Bot&quot;) thu thập, lưu trữ, sử dụng và bảo vệ thông tin cá nhân của bạn khi bạn tương tác với Bot.
            </p>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span className="text-pink-300">1.</span> <span>Dữ liệu Chúng tôi Thu thập</span>
              </h2>
              <p className="text-sm">Chúng tôi chỉ thu thập và lưu trữ thông tin tối thiểu cần thiết để vận hành và duy trì các tính năng trò chơi kinh tế RPG của Bot, bao gồm:</p>
              <ul className="list-disc pl-5 space-y-2 text-slate-400 text-sm">
                <li><strong>Discord User ID:</strong> Để định danh tài khoản người chơi duy nhất trong cơ sở dữ liệu.</li>
                <li><strong>Dữ liệu Game Kinh tế:</strong> Số dư ví ảo, số dư ngân hàng ảo, cấp độ người chơi, kinh nghiệm (EXP), năng lượng thể lực (⚡).</li>
                <li><strong>Tiến trình Game:</strong> Nghề nghiệp hiện tại, danh sách vật phẩm trong kho, tiến độ nhiệm vụ ngày, thành tựu đã mở khóa và bang hội (clan) của bạn.</li>
                <li><strong>Discord Guild (Server) ID:</strong> Để lưu trữ các cài đặt cấu hình riêng của từng server (ví dụ: kênh bot được phép hoạt động, chế độ AI, danh sách cấm).</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span className="text-pink-300">2.</span> <span>Nội dung Tin nhắn & Dữ liệu Trò chuyện AI</span>
              </h2>
              <ul className="list-disc pl-5 space-y-2 text-slate-400 text-sm">
                <li><strong>Không lưu trữ tin nhắn lâu dài:</strong> Bot KHÔNG bao giờ ghi lại hoặc lưu trữ nội dung tin nhắn của bạn vào cơ sở dữ liệu vĩnh viễn.</li>
                <li><strong>Ngữ cảnh trò chuyện AI:</strong> Khi bạn sử dụng lệnh `/ask` hoặc @tag Waguri để nói chuyện, nội dung tin nhắn của bạn được chuyển trực tiếp đến API trí tuệ nhân tạo Google Gemini để xử lý tạo câu trả lời.</li>
                <li>Ngữ cảnh hội thoại gần nhất (tối đa 6 lượt chat gần nhất) được giữ tạm thời trong bộ nhớ đệm (RAM) của ứng dụng để giúp AI trả lời mạch lạc và sẽ bị xóa sạch hoàn toàn ngay khi bot khởi động lại hoặc sau một thời gian không hoạt động.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span className="text-pink-300">3.</span> <span>Lưu trữ & Bảo mật Dữ liệu</span>
              </h2>
              <ul className="list-disc pl-5 space-y-2 text-slate-400 text-sm">
                <li>Dữ liệu game của bạn được lưu trữ an toàn trên dịch vụ cơ sở dữ liệu điện toán đám mây **Supabase (PostgreSQL)**.</li>
                <li>Chúng tôi áp dụng các biện pháp kỹ thuật tiêu chuẩn để bảo vệ cơ sở dữ liệu khỏi các truy cập trái phép. Tuy nhiên, xin lưu ý không có phương thức truyền tải internet hay lưu trữ đám mây nào là an toàn 100%.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span className="text-pink-300">4.</span> <span>Đăng nhập Web & Bảng điều khiển</span>
              </h2>
              <p className="text-sm">Trang web Waguri cho phép bạn <strong>đăng nhập bằng Discord (OAuth2)</strong> để xem bảng điều khiển cá nhân. Khi đăng nhập, chúng tôi xử lý:</p>
              <ul className="list-disc pl-5 space-y-2 text-slate-400 text-sm">
                <li><strong>Danh tính Discord (scope <code>identify</code>):</strong> Discord User ID, tên hiển thị và ảnh đại diện — để hiển thị đúng hồ sơ của bạn. <strong>Chúng tôi KHÔNG thu thập email.</strong></li>
                <li><strong>Danh sách server (scope <code>guilds</code>):</strong> chỉ dùng để lọc ra những server bạn tham gia <em>mà Waguri cũng có mặt</em>, phục vụ tính năng bảng xếp hạng theo server. Chúng tôi không lưu các server khác.</li>
                <li><strong>Phiên đăng nhập:</strong> được quản lý bằng cookie an toàn qua dịch vụ <strong>Supabase Auth</strong>; trang web được lưu trữ trên <strong>Vercel</strong>. Bạn có thể đăng xuất bất cứ lúc nào.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span className="text-pink-300">5.</span> <span>Quyền của Người dùng (Yêu cầu Xóa Dữ liệu)</span>
              </h2>
              <p className="text-slate-400 text-sm">
                Bạn có toàn quyền kiểm soát dữ liệu của mình. Nếu bạn muốn xóa toàn bộ dữ liệu game và thông tin cá nhân của mình liên quan đến Waguri Bot khỏi cơ sở dữ liệu của chúng tôi, bạn có thể gửi yêu cầu trực tiếp cho nhà phát triển qua máy chủ hỗ trợ. Dữ liệu của bạn sẽ được xóa vĩnh viễn trong vòng 48 giờ sau khi tiếp nhận yêu cầu.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span className="text-pink-300">6.</span> <span>Liên hệ Hỗ trợ</span>
              </h2>
              <p className="text-slate-400 text-sm">
                Nếu bạn có bất kỳ thắc mắc nào liên quan đến Chính sách Bảo mật này hoặc muốn yêu cầu xóa dữ liệu, vui lòng liên hệ với nhà phát triển qua:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400 text-sm">
                <li><strong>Server Discord Hỗ trợ:</strong> <a href="https://discord.gg/zbJ4SBaMhE" className="text-pink-300 hover:underline">Liên kết Server</a></li>
                <li><strong>Nhà phát triển:</strong> takei (Discord ID)</li>
              </ul>
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

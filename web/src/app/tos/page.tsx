import React from "react";
import CherryBlossom from "../../components/CherryBlossom";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

export default function TermsOfService() {
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
            <h1 className="text-3xl font-black text-white mb-2">Điều Khoản Dịch Vụ (Terms of Service)</h1>
            <p className="text-slate-400 text-xs">Cập nhật lần cuối: Ngày 21 tháng 6 năm 2026</p>
          </div>

          <div className="space-y-6 text-sm md:text-base leading-relaxed text-slate-300">
            <p>
              Chào mừng bạn đến với <strong>Waguri Discord Bot</strong> (sau đây gọi tắt là &quot;Bot&quot;). Bằng việc mời Bot vào server của bạn hoặc tương tác với các dịch vụ của Bot, bạn đồng ý tuân thủ và chấp nhận ràng buộc bởi các Điều khoản Dịch vụ dưới đây. Nếu bạn không đồng ý với bất kỳ phần nào của các điều khoản này, vui lòng ngừng sử dụng Bot.
            </p>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span className="text-pink-300">1.</span> <span>Hệ thống Kinh tế Ảo và Vật phẩm</span>
              </h2>
              <ul className="list-disc pl-5 space-y-2 text-slate-400 text-sm">
                <li>Tất cả tiền tệ ảo (VNĐ), năng lượng (⚡), trang bị, vật phẩm hoặc tài sản tích lũy trong hệ thống của Waguri hoàn toàn là ảo.</li>
                <li>Chúng không có giá trị tiền mặt thực tế và không thể được quy đổi, chuyển nhượng hoặc mua bán bằng tiền thật hoặc các hình thức giao dịch ngoài đời thực dưới mọi hình thức.</li>
                <li>Mọi hành vi mua bán tài khoản hoặc tài sản ảo trong Bot bằng tiền thật sẽ bị xử phạt nghiêm khắc (bao gồm ban vĩnh viễn và reset toàn bộ dữ liệu).</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span className="text-pink-300">2.</span> <span>Quy tắc Sử dụng & Hành vi Bị cấm</span>
              </h2>
              <p className="text-sm">Chúng tôi mong muốn xây dựng một cộng đồng lành mạnh và công bằng. Bạn đồng ý không thực hiện các hành vi sau:</p>
              <ul className="list-disc pl-5 space-y-2 text-slate-400 text-sm">
                <li>Lợi dụng, spam lệnh hoặc sử dụng các phần mềm tự động (botting/self-bot) để cày tiền ảo hoặc tương tác với hệ thống.</li>
                <li>Khai thác và lạm dụng các lỗi phần mềm (bugs/exploits) để trục lợi. Người dùng phát hiện lỗi có trách nhiệm báo cáo cho đội ngũ phát triển thay vì lợi dụng chúng.</li>
                <li>Sử dụng Bot để quấy rối, gây phiền hà cho người khác hoặc vi phạm Điều khoản Dịch vụ của Discord.</li>
              </ul>
              <p className="text-xs text-rose-300 bg-rose-500/5 border border-rose-500/10 p-3 rounded-lg">
                ⚠️ <strong>Hình phạt:</strong> Bất kỳ hành vi vi phạm nào đều có thể dẫn đến việc tài khoản của bạn bị hạn chế sử dụng lệnh, thu hồi toàn bộ tài sản ảo hoặc khóa quyền truy cập Bot vĩnh viễn trên toàn hệ thống mà không cần thông báo trước.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span className="text-pink-300">3.</span> <span>Tuyên bố Miễn trừ Trách nhiệm</span>
              </h2>
              <ul className="list-disc pl-5 space-y-2 text-slate-400 text-sm">
                <li>Bot được cung cấp dưới dạng &quot;nguyên trạng&quot; (as is) và &quot;sẵn có&quot; (as available). Chúng tôi không cam kết Bot sẽ luôn hoạt động liên tục 100% không gián đoạn hoặc không có lỗi.</li>
                <li>Chúng tôi không chịu trách nhiệm đối với bất kỳ mất mát dữ liệu ảo nào (ví dụ: mất tiền ảo, mất cấp độ, mất vật phẩm) do lỗi cơ sở dữ liệu, sự cố mạng hoặc hành vi trái phép từ bên thứ ba.</li>
                <li>Dịch vụ trò chuyện AI (sử dụng Gemini API) chỉ mang tính chất giải trí. Câu trả lời của AI do máy tạo ra và không đại diện cho quan điểm của nhà phát triển Bot. Chúng tôi không chịu trách nhiệm về tính chính xác của các nội dung này.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span className="text-pink-300">4.</span> <span>Tài khoản Web & Bảng điều khiển</span>
              </h2>
              <ul className="list-disc pl-5 space-y-2 text-slate-400 text-sm">
                <li>Bạn có thể đăng nhập trang web bằng tài khoản Discord để xem bảng điều khiển và quản lý cài đặt cá nhân. Bạn chịu trách nhiệm bảo mật phiên đăng nhập của mình.</li>
                <li>Bảng điều khiển chỉ hiển thị dữ liệu game của chính bạn; nghiêm cấm mọi hành vi cố gắng truy cập trái phép dữ liệu của người khác.</li>
                <li>Hồ sơ công khai (trang <code>/u/...</code>) hiển thị một số chỉ số game của bạn cho người khác xem; bạn có thể <strong>ẩn</strong> hồ sơ bất cứ lúc nào trong cài đặt.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span className="text-pink-300">5.</span> <span>Thay đổi Điều khoản</span>
              </h2>
              <p className="text-slate-400 text-sm">
                Chúng tôi có quyền sửa đổi hoặc thay thế các Điều khoản Dịch vụ này bất kỳ lúc nào để phù hợp với sự phát triển của Bot. Các thay đổi sẽ có hiệu lực ngay khi được đăng tải lên trang web này. Việc bạn tiếp tục sử dụng Bot sau khi có bất kỳ thay đổi nào đồng nghĩa với việc bạn chấp nhận các điều khoản mới.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span className="text-pink-300">6.</span> <span>Liên hệ Hỗ trợ</span>
              </h2>
              <p className="text-slate-400 text-sm">
                Nếu bạn có bất kỳ câu hỏi, khiếu nại hoặc muốn báo cáo lỗi/hành vi gian lận, vui lòng liên hệ với chúng tôi qua:
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

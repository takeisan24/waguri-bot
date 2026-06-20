import React from "react";
import Link from "next/link";
import CherryBlossom from "../../components/CherryBlossom";

export const metadata = {
  title: "Wiki 🌸 - Hướng dẫn chơi Waguri Bot",
  description:
    "Hướng dẫn đầy đủ cách chơi Waguri: kiếm tiền, năng lượng & mệt mỏi, đồ ăn & buff, mua bán, minigame, nuôi heo, trồng cây, hệ giam và trò chuyện AI.",
};

type Cmd = { c: string; d: string };

function Card({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <section className="glass-panel w-full p-6 md:p-8 rounded-2xl border border-pink-300/15 space-y-4 shadow-xl">
      <h2 className="text-xl font-black text-white flex items-center gap-2">
        <span>{emoji}</span> <span>{title}</span>
      </h2>
      <div className="space-y-3 text-sm md:text-[15px] leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

function CmdList({ items }: { items: Cmd[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it) => (
        <li key={it.c} className="flex flex-col sm:flex-row sm:items-baseline gap-x-3">
          <code className="text-pink-300 bg-pink-500/10 border border-pink-300/15 rounded px-2 py-0.5 text-[13px] whitespace-nowrap">
            {it.c}
          </code>
          <span className="text-slate-400">{it.d}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Wiki() {
  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-x-hidden bg-[#0d0812] text-slate-200">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-pink-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[70%] rounded-full bg-purple-600/10 blur-[130px]" />
      </div>

      <CherryBlossom />

      <header className="relative w-full max-w-4xl mx-auto px-6 py-5 flex items-center justify-between z-20">
        <Link href="/" className="flex items-center space-x-2 select-none group">
          <span className="text-xl font-black text-glow tracking-wider text-pink-300 group-hover:scale-105 transition-transform duration-300">
            WAGURI <span className="text-pink-400">🌸</span>
          </span>
        </Link>
        <Link href="/" className="text-xs font-bold text-pink-300 hover:text-pink-400 flex items-center space-x-1.5 transition-colors">
          <span>&larr;</span> <span>Quay lại trang chủ</span>
        </Link>
      </header>

      <main className="relative flex-1 flex flex-col items-center px-6 z-10 py-10 max-w-4xl mx-auto w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-black text-white">📖 Wiki — Hướng dẫn chơi Waguri</h1>
          <p className="text-slate-400 text-sm">
            Mọi lệnh dùng được bằng <code className="text-pink-300">/slash</code> hoặc prefix{" "}
            <code className="text-pink-300">w!</code> (ví dụ <code className="text-pink-300">w!work</code>). Tiền tệ là{" "}
            <strong>VNĐ ảo</strong>.
          </p>
        </div>

        <Card title="Bắt đầu" emoji="🌱">
          <p>Vài bước đầu để làm quen:</p>
          <CmdList
            items={[
              { c: "/daily", d: "điểm danh nhận thưởng mỗi ngày (có chuỗi streak)" },
              { c: "/work", d: "đi làm kiếm tiền — nguồn thu chính lúc đầu" },
              { c: "/status", d: "xem năng lượng, sức khỏe, buff, Premium, sự kiện" },
              { c: "/help", d: "xem toàn bộ lệnh" },
            ]}
          />
        </Card>

        <Card title="Kiếm tiền · Năng lượng · Mệt mỏi" emoji="💼">
          <p>
            Mỗi lần làm việc tốn <strong>năng lượng ⚡</strong> (tối đa 100, tự hồi +1/phút). Khi{" "}
            <strong>năng lượng hoặc sức khỏe tụt dưới 50%</strong>, thu nhập bắt đầu giảm dần (tối đa còn 50%) — nên
            nghỉ ngơi hồi sức rồi hẵng cày tiếp.
          </p>
          <CmdList
            items={[
              { c: "/work /fish /mine /chop", d: "các cách kiếm tiền (tốn năng lượng)" },
              { c: "/ngu", d: "ngủ hồi đầy năng lượng (có thời gian chờ)" },
              { c: "/eat <món>", d: "ăn đồ để hồi năng lượng hoặc nhận buff" },
              { c: "/hospital", d: "hồi đầy sức khỏe (tốn 10% tài sản)" },
              { c: "/jobs", d: "đổi nghề để lương cao hơn khi lên cấp" },
              { c: "/quest", d: "nhận & hoàn thành nhiệm vụ lấy thưởng" },
            ]}
          />
        </Card>

        <Card title="Cửa hàng · Mua bán · Đồ ăn & Buff" emoji="🏪">
          <p>
            <code className="text-pink-300">/shop</code> xem hàng, <code className="text-pink-300">/buy</code> mua,{" "}
            <code className="text-pink-300">/sell</code> bán lại (thu về <strong>50% giá</strong> — nên đừng mua đi bán
            lại). <code className="text-pink-300">/craft</code> chế đồ từ nguyên liệu <code>/mine</code>,{" "}
            <code>/chop</code>.
          </p>
          <p className="font-semibold text-white pt-1">Đồ ăn hồi năng lượng (⚡):</p>
          <CmdList
            items={[
              { c: "Bánh Mì Việt Nam", d: "+25 ⚡ · 150đ" },
              { c: "Xôi Xéo Hà Nội", d: "+40 ⚡ · 250đ" },
              { c: "Cà Phê Sữa Đá", d: "+60 ⚡ · 500đ" },
              { c: "Soda Trái Cây Gekka", d: "+100 ⚡ · 1.000đ (đầy 1 phát)" },
            ]}
          />
          <p className="font-semibold text-white pt-1">Hồi sức khỏe (❤️) & Buff thu nhập (🍗):</p>
          <CmdList
            items={[
              { c: "Thuốc cảm cúm / Hộp Y Tế Kikyo", d: "+20 / +50 sức khỏe" },
              { c: "Cơm Gà Việt", d: "+20% thu nhập trong 1 giờ · 2.000đ" },
              { c: "Bánh Kem Dâu Gekka", d: "+50% thu nhập trong 6 giờ · 20.000đ" },
              { c: "Bánh Cheesecake Gekka", d: "+100% thu nhập trong 8 giờ · 35.000đ" },
            ]}
          />
        </Card>

        <Card title="Minigame & Cờ bạc" emoji="🎲">
          <CmdList
            items={[
              { c: "/taixiu /baucua /coinflip", d: "cờ bạc nhanh, đặt cược ăn thua" },
              { c: "/blackjack /bacay /xocdia", d: "bài & xóc đĩa" },
              { c: "/crate", d: "mở rương bí ẩn nhận vật phẩm" },
              { c: "/duangua", d: "đặt cửa đua ngựa" },
              { c: "/loto /bingo", d: "chơi nhiều người trong phòng voice, máy gọi số" },
              { c: "/masoi", d: "Ma Sói 4–15 người, suy luận tìm Sói (có vai bí mật)" },
            ]}
          />
        </Card>

        <Card title="Nuôi heo 🐷" emoji="🐷">
          <p>
            Chu trình: <strong>mua → cho ăn → tắm → cho ngủ → cho ăn lần 2 (trưởng thành) → bán</strong>. Mỗi bước chăm
            sóc cách nhau ~15 phút; bỏ bê quá 4 tiếng heo sẽ bệnh. Bán heo cho ra <strong>Thịt Heo</strong> (vào kho){" "}
            <code>/eat</code> hồi sức hoặc <code>/sell</code> lấy tiền. Heo càng hiếm giá càng cao (2.000 → 50.000 với
            Heo Hologram huyền thoại).
          </p>
          <CmdList
            items={[
              { c: "/heo mua · w!muaheo", d: "mua heo con (1.000, tặng 1 cám)" },
              { c: "/heo an · w!heoan", d: "cho ăn (lần 1 free, lần 2 tốn 500 → trưởng thành)" },
              { c: "/heo tam · w!tamheo [@ai]", d: "tắm cho heo (hoặc tắm hộ người khác)" },
              { c: "/heo ngu · w!heongu", d: "cho heo ngủ" },
              { c: "/heo ban · w!banheo", d: "chế biến & bán heo trưởng thành" },
              { c: "/heo chuabenh · w!chuabenh", d: "chữa bệnh cho heo (1.000)" },
              { c: "/heo trom · w!tromheo @ai", d: "trộm heo trưởng thành của người khác (rủi ro!)" },
              { c: "/heo box · w!pigbox [@ai]", d: "mở/tặng hộp may mắn Pigbox (2.400, tối đa 10 lần/ngày)" },
            ]}
          />
        </Card>

        <Card title="Trồng cây 🌱" emoji="🌱">
          <p>
            Chu trình: <strong>mua giống → tưới 3 lần (mỗi lần cách 3 tiếng) → trưởng thành → thu hoạch (sau 1 giờ)</strong>.
            Bón phân hoặc nhờ người tưới hộ để nhanh hơn. Bỏ tưới quá 5 tiếng cây chết (cần hồi sinh). Thu hoạch ra{" "}
            <strong>trái cây</strong> (<code>/eat</code> hồi sức / <code>/sell</code>) hoặc <strong>hoa</strong> (<code>/sell</code>).
            Để mặc quá 1h30 người khác có thể trộm; quá 4 tiếng bị sâu bọ phá mất trắng.
          </p>
          <CmdList
            items={[
              { c: "/cay muagiong · w!muagiong", d: "mua giống & trồng (500)" },
              { c: "/cay tuoi · w!tuoinuoc [@ai]", d: "tưới nước (hoặc tưới hộ người khác)" },
              { c: "/cay bonphan · w!bonphan", d: "bón phân để cây thêm 1 nước ngay (200)" },
              { c: "/cay thuhoach · w!thuhoach", d: "thu hoạch cây trưởng thành" },
              { c: "/cay hoisinh · w!hoisinh", d: "hồi sinh cây đã chết (1.000)" },
              { c: "/cay phacay · w!phacay", d: "phá cây hiện tại để trồng cây mới" },
              { c: "/cay trom · w!trom @ai", d: "trộm cây trưởng thành của người khác (rủi ro!)" },
              { c: "/cay box · w!plantbox [@ai]", d: "mở/tặng hộp may mắn Plantbox (240, tối đa 10 lần/ngày)" },
            ]}
          />
        </Card>

        <Card title="Vòng khép kín nông trại 🔁" emoji="🔁">
          <p>
            Nuôi heo và trồng cây liên kết với nhau và với việc kiếm nguyên liệu, giúp tiết kiệm tiền:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
            <li>
              <strong>Thu hoạch cây</strong> → nhận thêm <strong>Cám Heo</strong> 🌽 → dùng cho heo ăn lần 2{" "}
              <em>miễn phí</em> (thay vì 500đ).
            </li>
            <li>
              <strong>Nuôi heo</strong> (cho ngủ) → nhặt được <strong>Phân Bón</strong> 💩 → bón cây <em>miễn phí</em>{" "}
              (thay vì 200đ).
            </li>
            <li>
              <code>/chop</code> + <code>/mine</code> → <code>/craft</code> ra <strong>Đồ Nghề Trộm</strong> 🧰 → đi trộm
              heo/cây <em>khỏi tốn tiền</em> mua đồ.
            </li>
            <li>
              Nghề <strong>Nông dân nông trại</strong> mở khoá ở Lv.5 trong <code>/jobs</code> — lương khá, rủi ro thấp.
            </li>
            <li>
              <code>/tangdo @ai &lt;vật phẩm&gt;</code> — tặng vật phẩm (hoa, thịt, đồ ăn...) cho người khác.
            </li>
          </ul>
        </Card>

        <Card title="Hệ giam 🚓" emoji="🚓">
          <p>
            Các hành vi "phạm pháp" — <code>/rob</code> cướp tiền, trộm heo/cây — nếu <strong>thất bại 3 lần</strong> mà
            không đủ tiền nộp phạt, cậu sẽ bị <strong>giam giữ</strong>: tạm thời không dùng được các lệnh kiếm tiền, cờ
            bạc và đi trộm cho tới khi được thả. Mua <strong>Bảo Hiểm Học Đường</strong> ở <code>/shop</code> để giảm nửa
            thời gian bị giam. Xem trạng thái giam ở <code>/status</code>.
          </p>
        </Card>

        <Card title="Trò chuyện cùng Waguri 💬" emoji="💬">
          <CmdList
            items={[
              { c: "/ask · @Waguri", d: "trò chuyện với Waguri Kaoruko (AI dịu dàng)" },
              { c: "/relationship", d: "xem mức thân thiết với Waguri 💞" },
              { c: "/premium", d: "gói Premium: thêm lượt chat AI + 10% thu nhập" },
            ]}
          />
        </Card>
      </main>

      <footer className="relative border-t border-slate-900 bg-[#07040a]/80 py-8 z-10 text-xs text-slate-500">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>&copy; {new Date().getFullYear()} Waguri. All rights reserved.</p>
          <div className="flex gap-6 text-[13px]">
            <Link href="/" className="hover:text-pink-300 transition-colors">Trang chủ</Link>
            <Link href="/tos" className="hover:text-pink-300 transition-colors">Điều Khoản</Link>
            <Link href="/privacy" className="hover:text-pink-300 transition-colors">Bảo Mật</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

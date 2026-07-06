"use client";

import { useState } from "react";

type Cmd = [string, string];
type Cat = { name: string; cmds: Cmd[] };

const CATEGORIES: Cat[] = [
  {
    name: "💼 Kinh tế & Nghề",
    cmds: [
      ["work", "làm việc kiếm tiền (tốn năng lượng)"],
      ["fish", "đi câu cá kiếm tiền"],
      ["mine", "đi đào mỏ kiếm tiền ⛏️"],
      ["chop", "đi chặt gỗ kiếm tiền 🪓"],
      ["daily", "điểm danh nhận thưởng + streak"],
      ["quest", "nhiệm vụ hằng ngày"],
      ["achievements", "thành tựu (mở khóa nhận thưởng)"],
      ["status", "trạng thái: năng lượng/mệt/buff/Premium 📊"],
      ["profile", "hồ sơ tổng quan"],
      ["jobs", "xem & xin nghề"],
      ["pet", "thú cưng: nhận nuôi / cho ăn 🐾"],
      ["cuutro", "nhận trợ cấp cứu trợ khi tài khoản cạn sạch tiền 💸"],
    ],
  },
  {
    name: "🏪 Cửa hàng & Kho",
    cmds: [
      ["store", "cửa hàng: xem danh sách, mua bán vật phẩm (list · buy · sell) 🏪"],
      ["market", "chợ mua bán giữa người chơi 🛒"],
      ["inventory", "xem kho đồ"],
      ["album", "xem sổ tay sưu tầm vật phẩm và nhận thưởng bộ sưu tập 📖"],
      ["pass", "xem và nhận thưởng Sổ Sứ Mệnh (Battle Pass) 📖"],
      ["eat", "dùng đồ ăn (hồi năng lượng / buff)"],
      ["nghingoi", "đi ngủ hồi đầy năng lượng 😴"],
      ["cosmetic", "trang trí hồ sơ: danh hiệu & màu 🎨"],
      ["craft", "chế tạo đồ từ gỗ/quặng/đá 🔨"],
      ["repair", "sửa công cụ khai thác (15% giá mua) 🔧"],
      ["hospital", "nhập viện hồi phục sức khỏe 🏥"],
    ],
  },
  {
    name: "💸 Giao dịch & Ngân hàng",
    cmds: [
      ["give", "chuyển tiền cho người khác"],
      ["bank", "ngân hàng: gửi/rút tiền 🏦"],
      ["rob", "cướp tiền (rủi ro cao!)"],
      ["vay", "vay–trả nợ 🤝 (muon·tra·doi·so)"],
      ["tangdo", "tặng vật phẩm trong kho cho người khác 🎁"],
    ],
  },
  {
    name: "🎲 Minigame & Nuôi trồng",
    cmds: [
      ["heo", "nuôi heo đất 🐷 (mua/chăm/bán/trộm)"],
      ["trongcay", "trồng cây 🌱 (giống/tưới/thu hoạch/trộm)"],
      ["tiembanh", "tiệm bánh Gekka 🍰 (kinh doanh thụ động)"],
      ["coinflip", "tung đồng xu"],
      ["taixiu", "tài xỉu"],
      ["baucua", "bầu cua tôm cá"],
      ["bacay", "ba cây 🃏 (nhiều người)"],
      ["blackjack", "xì dách"],
      ["crate", "mở rương bí ẩn 🎁"],
      ["bingo", "bingo 🎱 (gọi số tự động)"],
      ["loto", "loto 🔢 (vé 5 số, vào voice)"],
      ["masoi", "ma sói 🐺 (4-15 người, suy luận)"],
      ["xocdia", "xóc đĩa 🥢"],
      ["duangua", "đua ngựa 🐎"],
      ["dovui", "đố vui 🧠"],
    ],
  },
  {
    name: "🎀 Vui & Cộng đồng",
    cmds: [
      ["ship", "đo độ hợp giữa hai người"],
      ["boi", "xem bói 🔮"],
      ["amlich", "âm lịch · can-chi · giờ hoàng đạo 🌙"],
      ["lixi", "phát lì xì cho cả kênh 🧧"],
      ["couple", "kết hôn: xem trạng thái, ly hôn, đám cưới (status · marry · divorce) 💞"],
      ["action", "tương tác: ôm, hôn, xoa đầu, chọc, tát (hug · kiss · pat · poke · slap) 🌸"],
      ["date", "rủ đi hẹn hò 💑"],
      ["confession", "gửi confession ẩn danh 🤫"],
      ["noitu", "chơi nối từ tiếng Việt 🔤"],
    ],
  },
  {
    name: "🖼️ Ảnh & Tiện ích",
    cmds: [
      ["image", "xem ảnh động vật hoặc waifu dễ thương (cat · dog · waifu) 🖼️"],
      ["thoitiet", "xem thời tiết một thành phố"],
      ["announcement", "xem hoặc gửi thông báo cập nhật (view · send) 📢"],
    ],
  },
  {
    name: "💬 AI & Premium",
    cmds: [
      ["ask", "trò chuyện với Waguri (hoặc @tag)"],
      ["premium", "gói Premium 💎 (thêm lượt chat AI)"],
      ["henho", "hẹn hò và tặng quà cho Waguri để bồi đắp tình cảm 💖"],
    ],
  },
  {
    name: "🏰 Bang hội & Chợ",
    cmds: [
      ["clan", "lập bang / quỹ chung / ⚔️ chiến tranh bang"],
    ],
  },
  {
    name: "🏆 Khác",
    cmds: [
      ["leaderboard", "bảng xếp hạng (tài sản / cấp / tình cảm)"],
      ["start", "bắt đầu & nhận quà chào mừng 🎁"],
      ["event", "xem sự kiện x2 đang diễn ra 🎉"],
      ["vote", "vote trên Top.gg nhận thưởng 💝"],
      ["bot", "thông tin, trạng thái, hỗ trợ, mời bot (ping · about · support · invite) 🤖"],
      ["ticket", "mở phòng hỗ trợ riêng tư với staff 🎫"],
      ["server", "thông tin server"],
      ["user", "thông tin người dùng"],
      ["deletedata", "xoá toàn bộ dữ liệu cá nhân của bạn (không hoàn tác) 🗑️"],
      ["help", "bảng trợ giúp trong Discord"],
    ],
  },
  {
    name: "⚙️ Quản trị (cần quyền)",
    cmds: [
      ["setup", "tạo phòng riêng cho Waguri"],
      ["config", "cấu hình bot cho server (Quản lý Server)"],
      ["serverinfo", "báo cáo cấu trúc server để audit 🔍"],
      ["eco-admin", "công cụ owner: tiền/ban/premium"],
      ["premium-admin", "duyệt đơn Premium thủ công (owner) 💎"],
      ["getinvite", "tạo link mời server gửi owner qua DM (owner)"],
    ],
  },
];

export default function CommandsExplorer() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const query = q.trim().toLowerCase();

  const filtered = CATEGORIES.map((cat) => ({
    ...cat,
    cmds: query
      ? cat.cmds.filter(([c, d]) => c.includes(query) || d.toLowerCase().includes(query))
      : cat.cmds,
  })).filter((cat) => cat.cmds.length > 0);

  const total = CATEGORIES.reduce((s, c) => s + c.cmds.length, 0);

  return (
    <div className="w-full space-y-6">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`🔎 Tìm trong ${total} lệnh... (vd: work, may rủi, bang)`}
        className="w-full px-5 py-3 rounded-2xl bg-[#160f1f] border border-pink-300/20 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-pink-300/50"
        aria-label="Tìm lệnh"
      />

      {filtered.length === 0 ? (
        <p className="text-center text-slate-500 py-10">Không tìm thấy lệnh nào khớp~ 🌸</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((cat) => (
            <section key={cat.name} className="glass-panel rounded-2xl p-5 border border-pink-300/10 space-y-2.5">
              <h2 className="text-base font-extrabold text-white">{cat.name}</h2>
              <ul className="space-y-0.5">
                {cat.cmds.map(([c, d]) => {
                  const expanded = open === c;
                  return (
                    <li key={c}>
                      <button
                        onClick={() => setOpen(expanded ? null : c)}
                        className="w-full text-left flex flex-col sm:flex-row sm:items-baseline gap-x-3 rounded px-2 py-1.5 hover:bg-pink-500/5 transition-colors"
                        aria-expanded={expanded}
                      >
                        <code className="text-pink-300 bg-pink-500/10 border border-pink-300/15 rounded px-2 py-0.5 text-[13px] whitespace-nowrap">
                          /{c}
                        </code>
                        <span className="text-slate-400 text-sm">{d}</span>
                      </button>
                      {expanded ? (
                        <div className="ml-2 mb-1.5 pl-3 border-l-2 border-pink-300/25 text-xs text-slate-400 space-y-1 py-1">
                          <p>{d}.</p>
                          <p>
                            Cách dùng: <code className="text-pink-200">/{c}</code> · cũng được{" "}
                            <code className="text-pink-200">w!{c}</code>
                          </p>
                          <p>
                            Gõ <code className="text-pink-200">/help {c}</code> trong Discord để xem chi tiết tham số & lệnh con.
                          </p>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

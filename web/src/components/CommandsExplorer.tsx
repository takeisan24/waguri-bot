"use client";

import { useState } from "react";
import { useLanguage } from "./LanguageProvider";

type Cmd = [string, string];
type Cat = { name: string; cmds: Cmd[] };

const CATEGORIES_VI: Cat[] = [
  {
    name: "💼 Kinh tế & Nghề",
    cmds: [
      ["work", "làm việc kiếm tiền (tốn năng lượng)"],
      ["fish", "đi câu cá kiếm tiền"],
      ["mine", "đi đào mỏ kiếm tiền ⛏️"],
      ["chop", "đi chặt gỗ kiếm tiền 🪓"],
      ["daily", "điểm danh nhận thưởng + streak"],
      ["redeem", "đổi mã quà nhận xu/vật phẩm/Premium"],
      ["quest", "nhiệm vụ hằng ngày"],
      ["achievements", "thành tựu (mở khóa nhận thưởng)"],
      ["status", "trạng thái: năng lượng/mệt/buff/Premium 📊"],
      ["profile", "hồ sơ tổng quan"],
      ["jobs", "xem & xin nghề"],
      ["pet", "thú cưng: nhận nuôi / cho ăn 🐾"],
      ["prestige", "chuyển sinh khi đạt cấp tối đa để nhận vinh danh & đặc quyền 🌟"],
      ["relief", "nhận trợ cấp cứu trợ khi tài khoản cạn sạch tiền 💸"],
    ],
  },
  {
    name: "🏪 Cửa hàng & Kho",
    cmds: [
      ["store", "cửa hàng: xem danh sách, mua bán vật phẩm (list · buy · sell) 🏪"],
      ["market", "chợ nông sản biến động hàng giờ 🛒📈 (prices · sell)"],
      ["inventory", "xem kho đồ"],
      ["album", "xem sổ tay sưu tầm vật phẩm và nhận thưởng bộ sưu tập 📖"],
      ["pass", "xem và nhận thưởng Sổ Sứ Mệnh (Battle Pass) 📖"],
      ["eat", "dùng đồ ăn (hồi năng lượng / buff)"],
      ["rest", "đi ngủ hồi đầy năng lượng 😴"],
      ["cosmetic", "trang trí hồ sơ: danh hiệu & màu 🎨"],
      ["craft", "chế tạo đồ từ gỗ/quặng/đá 🔨"],
      ["repair", "sửa công cụ khai thác (15% giá mua) 🔧"],
      ["hospital", "nhập viện hồi phục sức khỏe 🏥"],
    ],
  },
  {
    name: "💸 Giao dịch & Tín dụng",
    cmds: [
      ["give", "chuyển tiền cho người khác"],
      ["bank", "ngân hàng: gửi/rút tiền 🏦"],
      ["rob", "cướp tiền (rủi ro cao!)"],
      ["loan", "quỹ tín dụng học đường Kikyo 🤝 (borrow · pay · status)"],
      ["gift", "tặng vật phẩm trong kho cho người khác 🎁"],
    ],
  },
  {
    name: "🎲 Nuôi trồng & Tiệm bánh",
    cmds: [
      ["farm", "nông trại Kikyo 🌱 (info · plant · water · harvest · steal)"],
      ["bakery", "tiệm bánh Gekka 🍰 kinh doanh thụ động & đơn hàng VIP (view · open · stock · collect · hire · fire · decor · upgrade · orders · deliver)"],
      ["coinflip", "tung đồng xu"],
      ["taixiu", "tài xỉu"],
      ["baucua", "bầu cua tôm cá"],
      ["blackjack", "xì dách (blackjack 21) 🃏"],
      ["crate", "mở rương bí ẩn 🎁"],
      ["loto", "loto 🔢 (vé 5 số, vào voice)"],
      ["masoi", "ma sói 🐺 (4-15 người, suy luận)"],
    ],
  },
  {
    name: "🎀 Vui & Cộng đồng",
    cmds: [
      ["trivia", "đố vui kiến thức 🧠 (trả lời nhanh trong chat)"],
      ["wordchain", "chơi nối từ tiếng Việt 🔤"],
      ["fortune", "xem bói: hằng ngày, cung hoàng đạo, thầy đồ 🔮"],
      ["lunar", "âm lịch · can-chi · giờ hoàng đạo 🌙"],
      ["lixi", "phát lì xì cho cả kênh 🧧"],
      ["couple", "kết hôn: xem trạng thái, ly hôn, đám cưới (status · marry · divorce) 💞"],
      ["action", "tương tác: ôm, hôn, xoa đầu, chọc, tát (hug · kiss · pat · poke · slap) 🌸"],
      ["confession", "gửi confession ẩn danh và nhận lời chữa lành từ Waguri 🤫"],
      ["study", "Pomodoro học bài cùng Waguri (start · status · stop · leaderboard) 📚"],
    ],
  },
  {
    name: "🖼️ Ảnh & Tiện ích",
    cmds: [
      ["image", "xem ảnh động vật hoặc waifu dễ thương (cat · dog · waifu) 🖼️"],
      ["weather", "xem thời tiết một thành phố 🌤️"],
      ["claim-support", "nhận quà gia nhập Server Support độc quyền 🎁"],
      ["announcement", "xem hoặc gửi thông báo cập nhật (view · send) 📢"],
    ],
  },
  {
    name: "💬 AI & Hẹn hò",
    cmds: [
      ["ask", "trò chuyện với Waguri (hoặc @tag)"],
      ["premium", "gói Premium 💎 (thêm lượt chat AI)"],
      ["dating", "hẹn hò và tặng quà cho Waguri để bồi đắp tình cảm 💖"],
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
      ["ticket", "mở form góp ý / hỗ trợ gửi trực tiếp đội ngũ 🌸"],
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
      ["antinuke", "chống nuke: chặn xoá kênh/role & ban hàng loạt 🛡️ (chủ server)"],
    ],
  },
];

const CATEGORIES_EN: Cat[] = [
  {
    name: "💼 Economy & Jobs",
    cmds: [
      ["work", "work to earn coins (consumes energy)"],
      ["fish", "go fishing for coins"],
      ["mine", "mine ore for coins ⛏️"],
      ["chop", "chop wood for coins 🪓"],
      ["daily", "daily check-in rewards & streak"],
      ["redeem", "redeem a gift code for coins/items/Premium"],
      ["quest", "daily quests"],
      ["achievements", "achievements (unlock for rewards)"],
      ["status", "status: energy, fatigue, buffs & Premium 📊"],
      ["profile", "general profile overview"],
      ["jobs", "view & apply for jobs"],
      ["pet", "pet: adopt or feed 🐾"],
      ["prestige", "prestige at max level for income boosts & honor 🌟"],
      ["relief", "claim welfare aid when out of coins 💸"],
    ],
  },
  {
    name: "🏪 Store & Inventory",
    cmds: [
      ["store", "store: list, buy, or sell items 🏪"],
      ["market", "hourly fluctuating agricultural market 🛒📈 (prices · sell)"],
      ["inventory", "view inventory"],
      ["album", "view collector handbook & claim collection rewards 📖"],
      ["pass", "view and claim Battle Pass rewards 📖"],
      ["eat", "consume food (restores energy / buffs)"],
      ["rest", "sleep to restore full energy 😴"],
      ["cosmetic", "decorate profile: titles & colors 🎨"],
      ["craft", "craft items from wood/ore/stone 🔨"],
      ["repair", "repair mining tools (15% of buy price) 🔧"],
      ["hospital", "hospitalize to restore health 🏥"],
    ],
  },
  {
    name: "💸 Transaction & Credit",
    cmds: [
      ["give", "transfer coins to another user"],
      ["bank", "bank: deposit or withdraw coins 🏦"],
      ["rob", "rob coins (high risk!)"],
      ["loan", "Kikyo student credit fund 🤝 (borrow · pay · status)"],
      ["gift", "gift inventory items to another user 🎁"],
    ],
  },
  {
    name: "🎲 Farming & Bakery",
    cmds: [
      ["farm", "Kikyo farm 🌱 (info · plant · water · harvest · steal)"],
      ["bakery", "Gekka Bakery 🍰 passive income & VIP catering (view · open · stock · collect · hire · fire · decor · upgrade · orders · deliver)"],
      ["coinflip", "coin flip"],
      ["taixiu", "tai xiu (over/under)"],
      ["baucua", "bau cua (gourd-crab-fish)"],
      ["blackjack", "blackjack (21 card game) 🃏"],
      ["crate", "open mystery crates 🎁"],
      ["loto", "loto 🔢 (5-number ticket, voice required)"],
      ["masoi", "werewolf 🐺 (4-15 players, deduction)"],
    ],
  },
  {
    name: "🎀 Fun & Community",
    cmds: [
      ["trivia", "trivia quiz 🧠 (fast chat answer)"],
      ["wordchain", "Vietnamese word chaining game 🔤"],
      ["fortune", "fortune telling: daily, horoscope, master 🔮"],
      ["lunar", "lunar calendar · horoscope 🌙"],
      ["lixi", "send lucky money to the channel 🧧"],
      ["couple", "marriage: status, marry, or divorce 💞"],
      ["action", "interaction: hug, kiss, pat, poke, slap 🌸"],
      ["confession", "send anonymous confession with healing Waguri reply 🤫"],
      ["study", "Pomodoro study companion 24/7 with Waguri (start · status · stop · leaderboard) 📚"],
    ],
  },
  {
    name: "🖼️ Image & Utilities",
    cmds: [
      ["image", "view cute animals or waifu photos (cat · dog · waifu) 🖼️"],
      ["weather", "check weather in a city 🌤️"],
      ["claim-support", "claim exclusive Support Server join rewards 🎁"],
      ["announcement", "view or send announcements 📢"],
    ],
  },
  {
    name: "💬 AI & Dating",
    cmds: [
      ["ask", "chat with Waguri (or @tag)"],
      ["premium", "Premium package 💎 (extra AI chats)"],
      ["dating", "date and gift Waguri to build affection 💖"],
    ],
  },
  {
    name: "🏆 Others",
    cmds: [
      ["leaderboard", "leaderboards (wealth / level / affection)"],
      ["start", "start & receive welcome gift 🎁"],
      ["event", "view ongoing x2 boost events 🎉"],
      ["vote", "vote on Top.gg for rewards 💝"],
      ["bot", "bot info, status, support link, invite link (ping · about · support · invite) 🤖"],
      ["ticket", "open feedback/support modal directly to staff 🌸"],
      ["server", "server stats & info"],
      ["user", "user info"],
      ["deletedata", "permanently delete all your personal data (irreversible) 🗑️"],
      ["help", "help command in Discord"],
    ],
  },
  {
    name: "⚙️ Admin (permissions required)",
    cmds: [
      ["setup", "create a dedicated channel for Waguri"],
      ["config", "configure bot settings for your server"],
      ["serverinfo", "report server structure for audit 🔍"],
      ["antinuke", "anti-nuke: stop mass channel/role deletion & ban waves 🛡️ (server owner)"],
    ],
  },
];

export default function CommandsExplorer() {
  const { t, locale } = useLanguage();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const query = q.trim().toLowerCase();

  const categories = locale === "en" ? CATEGORIES_EN : CATEGORIES_VI;

  const filtered = categories.map((cat) => ({
    ...cat,
    cmds: query
      ? cat.cmds.filter(([c, d]) => c.includes(query) || d.toLowerCase().includes(query))
      : cat.cmds,
  })).filter((cat) => cat.cmds.length > 0);

  const total = categories.reduce((s, c) => s + c.cmds.length, 0);

  return (
    <div className="w-full space-y-6">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("commands.search_placeholder", { count: total })}
        className="w-full px-5 py-3 rounded-2xl bg-[#160f1f] border border-pink-300/20 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-pink-300/50"
        aria-label="Tìm lệnh"
      />

      {filtered.length === 0 ? (
        <p className="text-center text-slate-500 py-10">{t("commands.no_results")}</p>
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
                            {t("commands.usage")} <code className="text-pink-200">/{c}</code> · {t("commands.or_prefix")}{" "}
                            <code className="text-pink-200">w!{c}</code>
                          </p>
                          <p>
                            {t("commands.help_tip", { cmd: `/help ${c}` })}
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

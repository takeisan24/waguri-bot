import Link from "next/link";
import { getLiveMarketPrices, getNextShiftCountdown, BASE_MARKET_ITEMS } from "../../lib/market";
import { getLocaleServer } from "../../lib/i18n";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

export const revalidate = 60;

export async function generateMetadata() {
  const isEn = (await getLocaleServer()) === "en";
  return {
    title: isEn
      ? "Live Commodity Market 📈 — Waguri Bot"
      : "Chợ Nông Thủy Sản Biến Động 📈 — Waguri Bot",
    description: isEn
      ? "Real-time price board for crops, seafood and minerals in Waguri Bot."
      : "Bảng tra cứu giá nông sản, thủy sản, khoáng sản biến động thời gian thực của Waguri Bot.",
  };
}

const fmt = (n: number, isEn = false) => Number(n || 0).toLocaleString(isEn ? "en-US" : "vi-VN");

export default async function MarketPage() {
  const locale = await getLocaleServer();
  const isEn = locale === "en";
  const prices = await getLiveMarketPrices();
  const countdown = getNextShiftCountdown();

  const categories = isEn
    ? [
        { key: "crop", title: "🌾 Crops", desc: "Wet rice, watermelon, tomato, potato" },
        { key: "pig", title: "🥓 Pig Farming", desc: "Fresh whole pork" },
        { key: "fish", title: "🐟 Fishing", desc: "Fresh fish, Koi, Golden Dragon Fish" },
        { key: "ore", title: "💎 Mining", desc: "Super gems, Dong Trieu gold" },
        { key: "wood", title: "🪵 Forestry", desc: "Solid wood, premium Ky Nam agarwood" },
      ]
    : [
        { key: "crop", title: "🌾 Nông Sản Cultivation", desc: "Lúa nước, dưa hấu, cà chua, khoai tây" },
        { key: "pig", title: "🥓 Chăn Nuôi Heo", desc: "Thịt heo sạch nguyên con" },
        { key: "fish", title: "🐟 Thủy Sản Câu Cá", desc: "Cá tươi, Cá Koi Nhật, Cá Rồng Vàng" },
        { key: "ore", title: "💎 Khai Thác Đào Mỏ", desc: "Đá siêu cấp, Vàng Đông Triều" },
        { key: "wood", title: "🪵 Khai Thác Lâm Nghiệp", desc: "Gỗ rắn, Kỳ Nam cao cấp" },
      ];

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200 overflow-x-hidden">
      <SiteHeader />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-12 md:py-16 space-y-10 z-10">
        {/* Header Title */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-300 text-xs md:text-sm font-semibold">
            <span>📈 Waguri Commodity Market Engine</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white">
            {isEn ? "Live Commodity " : "Chợ Nông Thủy Sản "}<span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-rose-300 to-amber-200">{isEn ? "Market" : "Biến Động"}</span>
          </h1>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            {isEn
              ? "Crop, seafood and mineral prices shift automatically every 4 hours on a server-wide rhythm. Time your sales to maximise profit!"
              : "Giá nông sản, hải sản và khoáng sản biến động tự động mỗi 4 giờ dựa trên nhịp sinh học toàn máy chủ. Hãy căn giờ xả hàng để tối ưu hóa lợi nhuận!"}
          </p>

          {/* Countdown Pill */}
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl glass-panel border border-pink-300/20 bg-pink-500/5">
            <span className="text-xl">⏳</span>
            <div className="text-left">
              <p className="text-xs text-slate-400 font-medium">{isEn ? "Next price shift in:" : "Lần biến động giá tiếp theo sau:"}</p>
              <p className="text-lg font-black text-pink-300 tracking-wider">{countdown}</p>
            </div>
          </div>
        </div>

        {/* Commodity Categories Grid */}
        <div className="space-y-8">
          {categories.map((cat) => {
            const catPrices = prices.filter((p) => BASE_MARKET_ITEMS[p.itemId as keyof typeof BASE_MARKET_ITEMS]?.category === cat.key);
            if (catPrices.length === 0) return null;

            return (
              <div key={cat.key} className="glass-panel rounded-3xl p-6 md:p-8 space-y-6 border border-pink-300/10">
                <div>
                  <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                    {cat.title}
                  </h2>
                  <p className="text-xs md:text-sm text-slate-400 mt-1">{cat.desc}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {catPrices.map((p) => {
                    const isUp = p.trend === "UP";
                    const isDown = p.trend === "DOWN";
                    const pctSign = p.pctChange > 0 ? `+${p.pctChange}%` : `${p.pctChange}%`;

                    return (
                      <div
                        key={p.itemId}
                        className="glass-panel rounded-2xl p-5 border border-slate-800 hover:border-pink-300/30 transition-all duration-300 space-y-3 relative overflow-hidden"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-3xl">{p.emoji}</span>
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full ${
                              isUp
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : isDown
                                ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                : "bg-slate-700/30 text-slate-400 border border-slate-700"
                            }`}
                          >
                            {isUp ? "📈" : isDown ? "📉" : "➡️"} {pctSign}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-base font-bold text-white">{isEn ? p.nameEn : p.nameVi}</h3>
                          <p className="text-xs text-slate-400">{isEn ? "Base price" : "Giá cơ sở"}: {fmt(p.basePrice, isEn)} VNĐ</p>
                        </div>

                        <div className="pt-2 border-t border-slate-800/60 flex items-baseline justify-between">
                          <span className="text-xs text-slate-500">{isEn ? "Current price:" : "Giá hiện tại:"}</span>
                          <span className="text-lg font-black text-amber-300">{fmt(p.currentPrice, isEn)} <span className="text-xs font-semibold text-slate-400">VNĐ</span></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Discord Command Callout */}
        <div className="glass-panel rounded-3xl p-8 text-center border border-dashed border-pink-300/25 space-y-4">
          <span className="text-4xl">🌾</span>
          <h3 className="text-xl font-extrabold text-white">{isEn ? "Sell your harvest right on Discord" : "Bán nông sản ngay trên Discord"}</h3>
          <p className="text-slate-400 text-sm max-w-lg mx-auto leading-relaxed">
            {isEn ? "Use " : "Dùng lệnh "}<code className="px-2 py-1 rounded bg-pink-500/20 text-pink-300 font-mono text-xs">/market sell [item] [qty]</code>{isEn ? " or " : " hoặc "}<code className="px-2 py-1 rounded bg-pink-500/20 text-pink-300 font-mono text-xs">/store sell</code>{isEn ? " to cash in at the live market price!" : " để chốt lời theo giá chợ biến động!"}
          </p>
          <div className="pt-2">
            <Link
              href="/commands"
              className="inline-block px-6 py-3 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 transition-all duration-300"
            >
              {isEn ? "Browse all commands 📜" : "Xem danh sách lệnh 📜"}
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

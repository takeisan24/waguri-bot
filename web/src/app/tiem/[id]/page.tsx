import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import CherryBlossom from "../../../components/CherryBlossom";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import { BOT_API } from "../../../lib/botApi";
import { getLocaleServer, t } from "../../../lib/i18n";
import LikeButton from "./LikeButton";

const API = BOT_API;

type BakeryData = {
  id: string;
  username: string;
  avatar: string | null;
  level: number;
  decor: string[];
  staff: string[];
  likes: number;
};

async function getBakery(id: string): Promise<BakeryData | "notfound" | null> {
  try {
    const res = await fetch(`${API}/api/bakery/${id}`, { next: { revalidate: 15 } });
    if (res.status === 404) return "notfound";
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocaleServer();
  const b = await getBakery(id);
  const name = b && b !== "notfound" ? b.username : t("profile.default_user", locale);
  return {
    title: t("bakery.meta_title", locale, { name }),
    description: t("bakery.meta_desc", locale, { name }),
  };
}

export default async function BakeryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocaleServer();
  const b = await getBakery(id);

  if (b === "notfound") {
    return (
      <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200 overflow-x-hidden">
        <CherryBlossom />
        <SiteHeader />
        <main className="relative flex-1 w-full max-w-3xl mx-auto px-6 py-12 z-10 flex flex-col justify-center items-center">
          <div className="glass-panel rounded-3xl p-10 text-center space-y-6 max-w-md border border-rose-500/10 shadow-2xl">
            <div className="text-6xl animate-bounce">🍰</div>
            <h1 className="text-2xl font-extrabold text-white">
              {t("bakery.not_found", locale)}
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              {t("bakery.not_found_desc", locale)}
            </p>
            <div className="pt-4">
              <Link
                href={`/u/${id}`}
                className="inline-block px-7 py-3 rounded-full font-bold bg-[#1c1224] text-pink-300 hover:bg-[#251830] transition-all border border-pink-500/20"
              >
                {locale === "en" ? "← Back to Profile" : "← Quay lại Hồ sơ"}
              </Link>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (!b) {
    notFound();
  }

  // Phân loại decor
  const wallDecors = b.decor.filter((d) => d === "trang_suc");
  const floorDecors = b.decor.filter((d) => d === "noi_that");
  const otherDecors = b.decor.filter((d) => d !== "trang_suc" && d !== "noi_that");

  // Điền vào các slot (tối đa 3 slot tường, 3 slot sàn)
  const wallSlots = [
    wallDecors[0] || otherDecors.shift() || null,
    wallDecors[1] || otherDecors.shift() || null,
    wallDecors[2] || otherDecors.shift() || null,
  ];

  const floorSlots = [
    floorDecors[0] || otherDecors.shift() || null,
    floorDecors[1] || otherDecors.shift() || null,
    floorDecors[2] || otherDecors.shift() || null,
  ];

  const staffSlots = [
    b.staff[0] || null,
    b.staff[1] || null,
  ];

  // Map ID -> Tên hiển thị & Emoji cho staff
  const staffConfig: { [key: string]: { name: string; emoji: string; color: string } } = {
    rintaro: { name: "Rintaro Tsumugi", emoji: "🧑‍🍳", color: "from-amber-500 to-orange-600" },
    subaru: { name: "Subaru Hoshina", emoji: "👓", color: "from-blue-500 to-indigo-600" },
    usami: { name: "Shohei Usami", emoji: "😆", color: "from-yellow-400 to-amber-500" },
    saku: { name: "Saku Natsui", emoji: "🤫", color: "from-teal-400 to-emerald-500" },
    ayato: { name: "Ayato Yorita", emoji: "🎯", color: "from-purple-500 to-pink-500" },
    madoka: { name: "Madoka Yano", emoji: "🌸", color: "from-rose-400 to-pink-500" },
  };

  const decorConfig: { [key: string]: { name: string; emoji: string } } = {
    noi_that: { name: locale === "en" ? "Wooden Furniture" : "Bộ Nội Thất Gỗ", emoji: "🪑" },
    trang_suc: { name: locale === "en" ? "Gem Jewelry" : "Trang Sức Đá Quý", emoji: "💎" },
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200 overflow-x-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-pink-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[70%] rounded-full bg-purple-600/10 blur-[130px]" />
      </div>
      <CherryBlossom />
      <SiteHeader />

      <main className="relative flex-1 w-full max-w-4xl mx-auto px-6 py-8 z-10 space-y-8">
        {/* Header Tiệm Bánh */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 glass-panel rounded-3xl p-6 border border-rose-500/10 shadow-2xl">
          <div className="flex items-center gap-5">
            <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-rose-400/30">
              {b.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.avatar} alt={b.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[#1c1224] flex items-center justify-center font-bold text-rose-400">
                  {b.username.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-white">
                {t("bakery.default_title", locale, { name: b.username })}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-rose-500/20 text-rose-300 border border-rose-400/20">
                  {t("bakery.level", locale, { level: b.level })}
                </span>
                <span className="text-xs text-pink-300/70 font-semibold">
                  ❤️ {b.likes} {locale === "en" ? "likes" : "lượt thích"}
                </span>
              </div>
            </div>
          </div>
          <div>
            <Link
              href={`/u/${id}`}
              className="inline-block px-6 py-2.5 rounded-full font-bold bg-[#1c1224] text-rose-300 hover:bg-[#251830] transition-all border border-pink-500/20 text-sm"
            >
              {locale === "en" ? "← Back to Profile" : "← Quay lại Hồ sơ"}
            </Link>
          </div>
        </div>

        {/* Mockup Lưới 2D Tiệm Bánh */}
        <div className="relative glass-panel rounded-3xl border border-rose-500/10 overflow-hidden shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-b from-[#1c1224]/85 to-[#0d0812]/95 z-0" />
          
          <div className="relative p-8 md:p-12 z-10 flex flex-col gap-10">
            {/* Hàng 1: Wall Slots (Treo tường) */}
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-widest text-pink-300/40 font-black">
                {locale === "en" ? "Wall Area" : "Khu Treo Tường"}
              </div>
              <div className="grid grid-cols-3 gap-4 md:gap-8">
                {wallSlots.map((item, idx) => (
                  <div
                    key={`wall-${idx}`}
                    className={`relative aspect-[4/3] rounded-2xl flex flex-col items-center justify-center border transition-all duration-300 ${
                      item
                        ? "bg-[#251830]/50 border-rose-400/20 shadow-lg shadow-pink-500/5"
                        : "border-dashed border-pink-500/20 bg-pink-950/5"
                    }`}
                  >
                    {item ? (
                      <div className="flex flex-col items-center gap-1.5 p-3 text-center">
                        <span className="text-3xl filter drop-shadow-md">
                          {decorConfig[item]?.emoji || "🖼️"}
                        </span>
                        <span className="text-xs font-bold text-rose-300">
                          {decorConfig[item]?.name || item}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-pink-300/20 text-center px-2">
                        {t("bakery.empty_decor", locale)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Hàng 2: Staff Slots (Nhân viên) */}
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-widest text-pink-300/40 font-black">
                {locale === "en" ? "Bakery Counter" : "Quầy Bánh & Nhân viên"}
              </div>
              <div className="flex justify-center gap-8 md:gap-16">
                {staffSlots.map((sid, idx) => {
                  const s = sid ? staffConfig[sid] : null;
                  return (
                    <div
                      key={`staff-${idx}`}
                      className={`relative w-28 md:w-36 aspect-[1/1] rounded-full flex flex-col items-center justify-center border transition-all duration-300 ${
                        s
                          ? "bg-[#251830]/50 border-rose-400/30 shadow-lg shadow-rose-500/10 scale-105"
                          : "border-dashed border-pink-500/20 bg-pink-950/5"
                      }`}
                    >
                      {s ? (
                        <div className="flex flex-col items-center gap-1 p-2 text-center">
                          <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${s.color} flex items-center justify-center text-2xl shadow-md`}>
                            {s.emoji}
                          </div>
                          <span className="text-xs font-extrabold text-white mt-1">
                            {s.name}
                          </span>
                          <span className="text-[9px] text-emerald-400 font-bold tracking-wide uppercase">
                            {locale === "en" ? "Active" : "Đang làm"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[9px] text-pink-300/20 text-center px-3">
                          {t("bakery.no_staff", locale)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hàng 3: Floor Slots (Đặt sàn) */}
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-widest text-pink-300/40 font-black">
                {locale === "en" ? "Floor Area" : "Mặt Sàn Tiệm Bánh"}
              </div>
              <div className="grid grid-cols-3 gap-4 md:gap-8">
                {floorSlots.map((item, idx) => (
                  <div
                    key={`floor-${idx}`}
                    className={`relative aspect-[4/3] rounded-2xl flex flex-col items-center justify-center border transition-all duration-300 ${
                      item
                        ? "bg-[#251830]/50 border-rose-400/20 shadow-lg shadow-pink-500/5"
                        : "border-dashed border-pink-500/20 bg-pink-950/5"
                    }`}
                  >
                    {item ? (
                      <div className="flex flex-col items-center gap-1.5 p-3 text-center">
                        <span className="text-3xl filter drop-shadow-md">
                          {decorConfig[item]?.emoji || "📦"}
                        </span>
                        <span className="text-xs font-bold text-rose-300">
                          {decorConfig[item]?.name || item}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-pink-300/20 text-center px-2">
                        {t("bakery.empty_decor", locale)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Nút Like (Client Component) */}
        <LikeButton ownerId={id} initialLikes={b.likes} locale={locale} ownerName={b.username} />

        {/* Thống kê chi tiết */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Cấu hình nhân sự */}
          <div className="glass-panel rounded-3xl p-6 border border-rose-500/10 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🧑‍🍳</span> {locale === "en" ? "Hired Staff" : "Nhân sự của tiệm"} ({b.staff.length})
            </h3>
            {b.staff.length === 0 ? (
              <p className="text-sm text-slate-400 italic">
                {locale === "en" ? "No staff hired yet." : "Tiệm chưa thuê nhân sự nào."}
              </p>
            ) : (
              <div className="space-y-3">
                {b.staff.map((sid) => {
                  const s = staffConfig[sid];
                  return (
                    <div key={`list-staff-${sid}`} className="flex items-center justify-between p-3 rounded-xl bg-[#1c1224]/50 border border-rose-500/5">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{s?.emoji || "👤"}</span>
                        <span className="text-sm font-bold text-slate-200">{s?.name || sid}</span>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-400/15">
                        {locale === "en" ? "Employee" : "Nhân viên"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Đồ trang trí nội thất */}
          <div className="glass-panel rounded-3xl p-6 border border-rose-500/10 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🪑</span> {locale === "en" ? "Bakery Decors" : "Nội thất sắp xếp"} ({b.decor.length})
            </h3>
            {b.decor.length === 0 ? (
              <p className="text-sm text-slate-400 italic">
                {locale === "en" ? "No decorations placed yet." : "Tiệm chưa sắp xếp đồ nội thất nào."}
              </p>
            ) : (
              <div className="space-y-3">
                {Array.from(new Set(b.decor)).map((iid) => {
                  const d = decorConfig[iid];
                  const count = b.decor.filter((x) => x === iid).length;
                  return (
                    <div key={`list-decor-${iid}`} className="flex items-center justify-between p-3 rounded-xl bg-[#1c1224]/50 border border-rose-500/5">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{d?.emoji || "📦"}</span>
                        <span className="text-sm font-bold text-slate-200">{d?.name || iid}</span>
                      </div>
                      <span className="text-xs font-bold text-pink-300">
                        x{count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

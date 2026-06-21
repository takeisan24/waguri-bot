import React from "react";
import Link from "next/link";

const VOTE_URL = "https://top.gg/bot/1482620714690543738/vote";

export default function SiteFooter() {
  return (
    <footer className="relative border-t border-slate-900 bg-[#07040a]/80 py-8 z-10 text-xs text-slate-500">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-5">
        <div className="flex flex-col items-center md:items-start gap-1.5">
          <span className="text-sm font-extrabold tracking-wider text-pink-300">WAGURI 🌸</span>
          <p>Made with 🌸 for Vietnamese Discord communities.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px]">
          <a href={VOTE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-pink-300 transition-colors">
            Vote Top.gg
          </a>
          <Link href="/wiki" className="hover:text-pink-300 transition-colors">Wiki</Link>
          <Link href="/leaderboard" className="hover:text-pink-300 transition-colors">Bảng xếp hạng</Link>
          <Link href="/tos" className="hover:text-pink-300 transition-colors">Điều Khoản</Link>
          <Link href="/privacy" className="hover:text-pink-300 transition-colors">Bảo Mật</Link>
          <a href="https://discord.gg/zbJ4SBaMhE" target="_blank" rel="noopener noreferrer" className="hover:text-pink-300 transition-colors">
            Hỗ Trợ
          </a>
        </div>
        <p>&copy; {new Date().getFullYear()} Waguri</p>
      </div>
    </footer>
  );
}

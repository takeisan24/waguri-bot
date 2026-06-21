"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "../lib/supabase/client";
import { getDiscordIdentity } from "../lib/discord";

const BOT_ID = "1482620714690543738";
const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${BOT_ID}&permissions=1099512007760&integration_type=0&scope=bot+applications.commands`;
const VOTE_URL = `https://top.gg/bot/${BOT_ID}/vote`;

const NAV = [
  { href: "/wiki", label: "Wiki" },
  { href: "/leaderboard", label: "Bảng xếp hạng" },
  { href: VOTE_URL, label: "💝 Vote", external: true },
];

type Me = { username: string; avatar: string | null } | null;

export default function SiteHeader() {
  const [me, setMe] = useState<Me>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (data.user) {
          const { username, avatar } = getDiscordIdentity(data.user);
          setMe({ username, avatar });
        }
      })
      .finally(() => setReady(true));
  }, []);

  const AuthArea = ({ mobile = false }: { mobile?: boolean }) =>
    !ready ? null : me ? (
      <Link
        href="/dashboard"
        className={`flex items-center gap-2 ${mobile ? "px-4 py-2 w-full justify-center" : "px-3 py-1.5"} rounded-full text-xs font-bold border border-pink-300/30 text-pink-100 hover:border-pink-300/60 bg-pink-500/5 transition-all`}
      >
        {me.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatar} alt="" width={20} height={20} className="rounded-full" />
        ) : null}
        Dashboard
      </Link>
    ) : (
      <Link
        href="/login"
        className={`${mobile ? "w-full text-center px-4 py-2" : "px-4 py-2"} rounded-full text-xs font-bold border border-pink-300/30 text-pink-200 hover:text-white hover:border-pink-300/60 bg-pink-500/5 transition-all`}
      >
        Đăng nhập
      </Link>
    );

  return (
    <header className="sticky top-0 w-full bg-[#0d0812]/80 backdrop-blur-md border-b border-pink-300/10 z-40">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2 select-none group" onClick={() => setOpen(false)}>
          <span className="text-2xl font-black text-glow tracking-wider text-pink-300 group-hover:scale-105 transition-transform duration-300">
            WAGURI <span className="text-pink-400">🌸</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          {NAV.map((n) =>
            n.external ? (
              <a key={n.href} href={n.href} target="_blank" rel="noopener noreferrer" className="hover:text-pink-300 transition-colors">
                {n.label}
              </a>
            ) : (
              <Link key={n.href} href={n.href} className="hover:text-pink-300 transition-colors">
                {n.label}
              </Link>
            )
          )}
          <AuthArea />
          <a
            href={INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-full text-xs font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 shadow-[0_0_20px_rgba(255,183,197,0.3)] transition-all duration-300 hover:-translate-y-0.5"
          >
            Thêm Vào Discord
          </a>
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="md:hidden flex flex-col gap-1.5 p-2"
          aria-label="Menu"
          aria-expanded={open}
        >
          <span className={`block w-6 h-0.5 bg-pink-200 transition-transform ${open ? "translate-y-2 rotate-45" : ""}`} />
          <span className={`block w-6 h-0.5 bg-pink-200 transition-opacity ${open ? "opacity-0" : ""}`} />
          <span className={`block w-6 h-0.5 bg-pink-200 transition-transform ${open ? "-translate-y-2 -rotate-45" : ""}`} />
        </button>
      </div>

      {/* Mobile dropdown */}
      {open ? (
        <div className="md:hidden border-t border-pink-300/10 bg-[#0d0812]/95 backdrop-blur-md px-6 py-4 flex flex-col gap-3">
          {NAV.map((n) =>
            n.external ? (
              <a key={n.href} href={n.href} target="_blank" rel="noopener noreferrer" className="text-slate-200 hover:text-pink-300 py-1" onClick={() => setOpen(false)}>
                {n.label}
              </a>
            ) : (
              <Link key={n.href} href={n.href} className="text-slate-200 hover:text-pink-300 py-1" onClick={() => setOpen(false)}>
                {n.label}
              </Link>
            )
          )}
          <AuthArea mobile />
          <a
            href={INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full text-center px-5 py-2.5 rounded-full text-sm font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 transition-all"
          >
            Thêm Vào Discord 🌸
          </a>
        </div>
      ) : null}
    </header>
  );
}

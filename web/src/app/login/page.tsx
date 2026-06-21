"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        scopes: "identify guilds",
      },
    });
    if (error) setLoading(false);
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-[#0d0812] text-slate-200 px-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-pink-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[70%] rounded-full bg-purple-600/10 blur-[130px]" />
      </div>

      <div className="relative z-10 glass-panel rounded-3xl p-10 max-w-sm w-full text-center space-y-6 border border-pink-300/20">
        <Link href="/" className="text-2xl font-black text-glow tracking-wider text-pink-300">
          WAGURI <span className="text-pink-400">🌸</span>
        </Link>
        <div className="space-y-2">
          <h1 className="text-xl font-extrabold text-white">Đăng nhập</h1>
          <p className="text-slate-400 text-sm">
            Đăng nhập bằng Discord để xem bảng điều khiển cá nhân của cậu nha~
          </p>
        </div>
        <button
          onClick={signIn}
          disabled={loading}
          className="w-full px-6 py-3 rounded-full font-bold bg-[#5865F2] text-white hover:bg-[#4752c4] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? "Đang chuyển..." : "Đăng nhập bằng Discord"}
        </button>
        <Link href="/" className="block text-xs text-slate-500 hover:text-pink-300">
          ← Về trang chủ
        </Link>
      </div>
    </div>
  );
}

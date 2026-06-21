import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

// Đích redirect sau khi Supabase xử lý OAuth Discord -> đổi code lấy phiên.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Best-effort: lưu danh sách server CHUNG (user tham gia ∩ bot có mặt) vào
      // user_metadata để dashboard hiện BXH theo server. Lỗi -> bỏ qua, không chặn login.
      try {
        const token = data.session?.provider_token;
        if (token) {
          const [ug, bg] = await Promise.all([
            fetch("https://discord.com/api/users/@me/guilds", { headers: { Authorization: `Bearer ${token}` } }),
            fetch("https://chocobot.wispbyte.app/api/guilds"),
          ]);
          if (ug.ok && bg.ok) {
            const userGuilds = await ug.json();
            const botIds = new Set<string>((await bg.json()).ids || []);
            const mutual = (Array.isArray(userGuilds) ? userGuilds : [])
              .filter((g: { id: string }) => botIds.has(g.id))
              .map((g: { id: string; name: string; icon: string | null }) => ({ id: g.id, name: g.name, icon: g.icon }))
              .slice(0, 30);
            await supabase.auth.updateUser({ data: { guilds: mutual } });
          }
        }
      } catch {
        /* best-effort */
      }
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

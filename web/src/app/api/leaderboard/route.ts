import { NextResponse } from "next/server";
import { BOT_API } from "../../../lib/botApi";
import { createAdminClient } from "../../../lib/supabase/admin";

export const revalidate = 30; // Cache 30 seconds

// Tự động nạp Tên & Avatar thật từ Discord API nếu DB chưa kịp sync (0 cần chạy script)
async function hydrateDiscordProfiles(rows: Array<{ id: string; username: string; avatar: string | null; value: number }>) {
  const missing = rows.filter(r => !r.avatar || !r.username || r.username.startsWith("Người chơi #"));
  if (missing.length === 0) return;

  await Promise.all(missing.map(async (r) => {
    try {
      const res = await fetch(`https://discord.com/api/v10/users/${r.id}`, {
        next: { revalidate: 86400 } // Cache 24h
      });
      if (res.ok) {
        const u = await res.json();
        r.username = u.global_name || u.username || r.username;
        r.avatar = u.avatar
          ? `https://cdn.discordapp.com/avatars/${r.id}/${u.avatar}.png?size=128`
          : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(r.id) >> BigInt(22)) % BigInt(5))}.png`;
      }
    } catch {
      /* ignore */
    }
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "level" ? "level" : (searchParams.get("type") === "bakery" ? "bakery" : "wealth");
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 10, 1), 25);
  const guild = searchParams.get("guild") && /^\d{5,25}$/.test(searchParams.get("guild")!) ? searchParams.get("guild") : null;

  // 1. UƯ TIÊN TRUY VẤN SUPABASE DB TRỰC TIẾP (Siêu tốc: ~20ms)
  try {
    const admin = createAdminClient();
    const rows: Array<{ id: string; username: string; avatar: string | null; value: number; level?: number; likes?: number }> = [];

    if (type === "bakery") {
      const { data } = await admin
        .from("bakeries")
        .select("user_id, bakery_score, level, likes_count")
        .order("bakery_score", { ascending: false })
        .limit(limit);

      if (data && data.length > 0) {
        for (const r of data) {
          rows.push({
            id: r.user_id,
            username: `Chủ tiệm #${r.user_id.slice(-4)}`,
            avatar: null,
            value: Number(r.bakery_score || 0),
            level: r.level || 1,
            likes: r.likes_count || 0,
          });
        }
      }
    } else if (type === "level") {
      const { data } = await admin
        .from("users")
        .select("user_id, exp, username, avatar")
        .order("exp", { ascending: false })
        .limit(limit);

      if (data && data.length > 0) {
        for (const r of data) {
          const exp = Number(r.exp || 0);
          const lvl = Math.floor(Math.sqrt(exp / 1000)) + 1;
          rows.push({
            id: r.user_id,
            username: r.username || `Người chơi #${r.user_id.slice(-4)}`,
            avatar: r.avatar || null,
            value: lvl,
          });
        }
      }
    } else {
      // Wealth: RPC leaderboard_rows
      const { data, error } = await admin.rpc("leaderboard_rows", { p_sort: "wealth", p_limit: limit });
      if (!error && Array.isArray(data) && data.length > 0) {
        for (const r of data) {
          rows.push({
            id: r.user_id,
            username: r.username || `Người chơi #${r.user_id.slice(-4)}`,
            avatar: r.avatar || null,
            value: Number(r.networth || 0),
          });
        }
      } else {
        const { data: usersData } = await admin
          .from("users")
          .select("user_id, wallet, bank, username, avatar")
          .order("wallet", { ascending: false })
          .limit(limit);

        if (usersData && usersData.length > 0) {
          for (const r of usersData) {
            rows.push({
              id: r.user_id,
              username: r.username || `Người chơi #${r.user_id.slice(-4)}`,
              avatar: r.avatar || null,
              value: Number(r.wallet || 0) + Number(r.bank || 0),
            });
          }
        }
      }
    }

    if (rows.length > 0) {
      // Tự động nạp Tên & Avatar từ Discord API nếu bất kỳ dòng nào bị thiếu (0 cần chạy script tay)
      await hydrateDiscordProfiles(rows);
      return NextResponse.json({ type, rows });
    }
  } catch (err) {
    /* Fallback sang Bot API nếu DB rỗng hoặc lỗi */
  }

  // 2. FALLBACK: Fetch từ Bot API nếu DB chưa sẵn sàng
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1000);
    const botUrl = `${BOT_API}/api/leaderboard?type=${type}&limit=${limit}${guild ? `&guild=${guild}` : ""}`;
    const res = await fetch(botUrl, { signal: ctrl.signal, next: { revalidate: 30 } });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.rows) && data.rows.length > 0) {
        return NextResponse.json(data);
      }
    }
  } catch {
    /* Ignore */
  }

  return NextResponse.json({ type, rows: [] });
}

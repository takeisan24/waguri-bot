import { NextResponse } from "next/server";
import { BOT_API } from "../../../lib/botApi";
import { createAdminClient } from "../../../lib/supabase/admin";

export const revalidate = 30; // Cache 30 seconds

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "level" ? "level" : (searchParams.get("type") === "bakery" ? "bakery" : "wealth");
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 10, 1), 25);
  const guild = searchParams.get("guild") && /^\d{5,25}$/.test(searchParams.get("guild")!) ? searchParams.get("guild") : null;

  // 1. Thử fetch từ Bot API (với 2.5s timeout) để lấy tên Discord & avatar đầy đủ
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
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
    /* Bot API offline/timeout -> Chuyển sang Fallback truy vấn Supabase DB trực tiếp */
  }

  // 2. Fallback: Truy vấn trực tiếp từ Supabase DB
  try {
    const admin = createAdminClient();
    const rows: Array<{ id: string; username: string; avatar: string | null; value: number; level?: number; likes?: number }> = [];

    if (type === "bakery") {
      const { data } = await admin
        .from("bakeries")
        .select("user_id, bakery_score, level, likes_count")
        .order("bakery_score", { ascending: false })
        .limit(limit);

      if (data) {
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
        .select("user_id, exp")
        .order("exp", { ascending: false })
        .limit(limit);

      if (data) {
        for (const r of data) {
          const exp = Number(r.exp || 0);
          const lvl = Math.floor(Math.sqrt(exp / 1000)) + 1;
          rows.push({
            id: r.user_id,
            username: `Người chơi #${r.user_id.slice(-4)}`,
            avatar: null,
            value: lvl,
          });
        }
      }
    } else {
      // Wealth: RPC leaderboard_rows hoặc wallet + bank
      const { data, error } = await admin.rpc("leaderboard_rows", { p_sort: "wealth", p_limit: limit });
      if (!error && Array.isArray(data) && data.length > 0) {
        for (const r of data) {
          rows.push({
            id: r.user_id,
            username: `Người chơi #${r.user_id.slice(-4)}`,
            avatar: null,
            value: Number(r.networth || 0),
          });
        }
      } else {
        const { data: usersData } = await admin
          .from("users")
          .select("user_id, wallet, bank")
          .order("wallet", { ascending: false })
          .limit(limit);

        if (usersData) {
          for (const r of usersData) {
            rows.push({
              id: r.user_id,
              username: `Người chơi #${r.user_id.slice(-4)}`,
              avatar: null,
              value: Number(r.wallet || 0) + Number(r.bank || 0),
            });
          }
        }
      }
    }

    return NextResponse.json({ type, rows });
  } catch (err) {
    return NextResponse.json({ type, rows: [] }, { status: 500 });
  }
}

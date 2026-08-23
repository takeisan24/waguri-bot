import { NextResponse } from "next/server";
import { BOT_API } from "../../../lib/botApi";
import { createAdminClient } from "../../../lib/supabase/admin";

export const revalidate = 30; // Cache 30 seconds

// GHI CHÚ: Đã BỎ "hydrate Discord profile" (fetch discord.com/api/v10/users/{id} không kèm bot token
// -> luôn 401, không điền được gì) — nó là no-op mà vẫn tốn round-trip & có rủi ro treo SSR. Tên/avatar
// thật đã được bot đồng bộ sẵn vào cột users.username/avatar (migration 0092) và RPC trả về.

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
      // Dùng RPC chứ KHÔNG truy vấn thẳng bảng, vì hai lý do đều đã đo được:
      //
      //  1. `bakeries` KHÔNG có cột `bakery_score` — nó được TÍNH trong RPC
      //     (level*1000 + likes*50 + số nhân viên*100). Bản cũ select và order theo cột đó
      //     nên PostgREST trả "column bakeries.bakery_score does not exist", `data` thành
      //     null, và vì mã chỉ lấy `data` mà bỏ `error` nên lỗi bị nuốt sạch: bảng xếp hạng
      //     tiệm bánh LUÔN rỗng, im lặng, không ai biết.
      //  2. RPC lọc `COALESCE(u.profile_public, true)` — truy vấn thẳng thì không, tức người
      //     đã chọn ẩn hồ sơ vẫn lộ ra (kèm nguyên user_id) như hai bảng xếp hạng kia đã
      //     tránh được từ lâu.
      const { data, error } = await admin.rpc("get_bakery_leaderboard", {
        p_limit: limit,
        p_offset: 0,
      });
      if (error) console.error("[leaderboard] bakery RPC lỗi:", error.message);

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
      const { data, error } = await admin
        .from("users")
        .select("user_id, exp, username, avatar")
        .not("profile_public", "is", false) // tôn trọng hồ sơ ẩn (true/null = hiện, false = ẩn)
        .not("exclude_from_economy", "is", true) // ẩn tài khoản vận hành (0099)
        .order("exp", { ascending: false })
        .limit(limit);
      if (error) console.error("[leaderboard] level lỗi:", error.message);

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
        const { data: usersData, error: usersErr } = await admin
          .from("users")
          .select("user_id, wallet, bank, username, avatar")
          .not("profile_public", "is", false) // tôn trọng hồ sơ ẩn
          .not("exclude_from_economy", "is", true) // ẩn tài khoản vận hành (0099)
          .order("wallet", { ascending: false })
          .limit(limit);
        if (usersErr) console.error("[leaderboard] wealth dự phòng lỗi:", usersErr.message);

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
      return NextResponse.json({ type, rows });
    }
  } catch {
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

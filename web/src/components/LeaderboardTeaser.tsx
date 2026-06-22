import Link from "next/link";

// Teaser top đại gia trên landing — lấy live từ API bot (server component, revalidate 120s).
const API = "https://waguribot.wispbyte.app";
const MEDALS = ["🥇", "🥈", "🥉"];
const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");

type Row = { id: string; username: string; avatar: string | null; value: number };

async function getTop(): Promise<Row[]> {
  try {
    const res = await fetch(`${API}/api/leaderboard?type=wealth&limit=5`, { next: { revalidate: 120 } });
    if (!res.ok) return [];
    const d = await res.json();
    return (d.rows || []).slice(0, 5);
  } catch {
    return [];
  }
}

export default async function LeaderboardTeaser() {
  const rows = await getTop();
  return (
    <section className="w-full py-12 md:py-16">
      <div className="text-center max-w-2xl mx-auto mb-8 space-y-2">
        <h2 className="text-3xl md:text-4xl font-extrabold text-white">🏆 Top Đại Gia</h2>
        <p className="text-slate-400 text-sm md:text-base">Những người chơi giàu nhất Waguri — bạn có lọt top không?</p>
      </div>
      <div className="max-w-xl mx-auto glass-panel rounded-3xl p-5 border border-pink-300/15">
        {rows.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-4">Bảng xếp hạng đang cập nhật~ 🌸</p>
        ) : (
          <ol className="space-y-1.5">
            {rows.map((r, i) => (
              <li key={r.id}>
                <Link
                  href={`/u/${r.id}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-pink-500/5 transition-colors"
                >
                  <span className="w-7 text-center font-bold text-pink-300">{MEDALS[i] || i + 1}</span>
                  {r.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.avatar} alt={r.username} width={32} height={32} className="rounded-full" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-[#241a2e]" />
                  )}
                  <span className="flex-1 truncate text-slate-200">{r.username}</span>
                  <span className="font-bold text-white">
                    {fmt(r.value)} <span className="text-pink-300/70 text-xs">VNĐ</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
        <div className="text-center mt-3">
          <Link href="/leaderboard" className="inline-block text-sm font-bold text-pink-300 hover:text-pink-200">
            Xem bảng xếp hạng đầy đủ →
          </Link>
        </div>
      </div>
    </section>
  );
}

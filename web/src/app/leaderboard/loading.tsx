// Skeleton hiển thị ngay khi điều hướng tới /leaderboard (Next streaming).
export default function LoadingLeaderboard() {
  return (
    <div className="min-h-screen bg-[#0d0812] text-slate-200 flex flex-col items-center px-6 py-10">
      <div className="h-8 w-56 rounded-lg bg-pink-300/10 animate-pulse mb-6" />
      <div className="w-full max-w-2xl space-y-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 glass-panel rounded-2xl p-4 border border-pink-300/10"
          >
            <div className="h-9 w-9 rounded-full bg-pink-300/10 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 rounded bg-pink-300/10 animate-pulse" />
              <div className="h-3 w-1/4 rounded bg-pink-300/5 animate-pulse" />
            </div>
            <div className="h-4 w-20 rounded bg-pink-300/10 animate-pulse" />
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate-500">Đang tải bảng xếp hạng~ 🌸</p>
    </div>
  );
}

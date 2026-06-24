// Skeleton trong lúc dashboard (server component động) tải dữ liệu.
export default function DashboardLoading() {
  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200">
      <header className="w-full max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="h-6 w-28 rounded bg-pink-300/10 animate-pulse" />
        <div className="h-4 w-20 rounded bg-pink-300/10 animate-pulse" />
      </header>
      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-6 space-y-6">
        <div className="glass-panel rounded-3xl p-7 flex items-center gap-5 border border-pink-300/20">
          <div className="w-20 h-20 rounded-full bg-pink-300/10 animate-pulse" />
          <div className="flex-1 space-y-3">
            <div className="h-6 w-40 rounded bg-pink-300/10 animate-pulse" />
            <div className="h-3 w-56 rounded bg-pink-300/10 animate-pulse" />
            <div className="h-2.5 w-full rounded-full bg-pink-300/10 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-panel rounded-2xl px-5 py-4 h-20 border border-pink-300/10 animate-pulse" />
          ))}
        </div>
        <div className="glass-panel rounded-3xl p-6 h-32 border border-pink-300/10 animate-pulse" />
        <div className="glass-panel rounded-3xl p-6 h-28 border border-pink-300/10 animate-pulse" />
      </main>
    </div>
  );
}

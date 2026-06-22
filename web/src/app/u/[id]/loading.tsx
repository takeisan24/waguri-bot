// Skeleton hiển thị ngay khi điều hướng tới hồ sơ công khai /u/[id].
export default function LoadingProfile() {
  return (
    <div className="min-h-screen bg-[#0d0812] text-slate-200 flex flex-col items-center px-6 py-12">
      <div className="w-full max-w-md glass-panel rounded-3xl p-7 border border-pink-300/10 flex flex-col items-center">
        <div className="h-24 w-24 rounded-full bg-pink-300/10 animate-pulse" />
        <div className="h-5 w-40 rounded bg-pink-300/10 animate-pulse mt-4" />
        <div className="h-3 w-24 rounded bg-pink-300/5 animate-pulse mt-2" />
        <div className="grid grid-cols-2 gap-3 w-full mt-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-pink-300/5 animate-pulse" />
          ))}
        </div>
      </div>
      <p className="mt-6 text-sm text-slate-500">Đang tải hồ sơ~ 🌸</p>
    </div>
  );
}

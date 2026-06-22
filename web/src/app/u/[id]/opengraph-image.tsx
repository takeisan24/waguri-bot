import { ImageResponse } from "next/og";

export const alt = "Hồ sơ Waguri";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API = "https://waguribot.wispbyte.app";
// Load cả latin + vietnamese subset -> satori chọn glyph theo từng ký tự (tên/nghề có dấu).
const FONT_URLS = [
  "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.1.1/files/inter-latin-600-normal.woff",
  "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.1.1/files/inter-vietnamese-600-normal.woff",
];

type FontEntry = { name: string; data: ArrayBuffer; weight: 600; style: "normal" };
let fontCache: FontEntry[] | null = null;
async function loadFonts(): Promise<FontEntry[]> {
  if (fontCache) return fontCache;
  try {
    const datas = await Promise.all(FONT_URLS.map((u) => fetch(u).then((r) => r.arrayBuffer())));
    fontCache = datas.map((data) => ({ name: "Inter", data, weight: 600 as const, style: "normal" as const }));
  } catch {
    fontCache = []; // hỏng -> dùng font mặc định (vẫn render được Latin)
  }
  return fontCache;
}

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let p: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${API}/api/profile/${id}`, { next: { revalidate: 60 } });
    if (res.ok) p = await res.json();
  } catch {
    /* bot offline -> thẻ chung */
  }
  const fonts = await loadFonts();

  const hidden = !p || p.hidden === true;
  const username = (hidden ? "Waguri" : (p!.username as string)) || "Người chơi";
  const level = hidden ? 0 : Number(p!.level || 0);
  const netWorth = hidden ? 0 : Number(p!.netWorth || 0);
  const rank = hidden ? 0 : Number(p!.rank || 0);
  const job = hidden ? "" : ((p!.job as string) || "Nghề tự do");

  const Stat = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", fontSize: 26, color: "#f7a8bf", letterSpacing: 2 }}>{label}</div>
      <div style={{ display: "flex", fontSize: 58, color: "#ffffff" }}>{value}</div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "70px 90px",
          background: "radial-gradient(circle at 22% 18%, #3a1030 0%, #0d0812 58%), #0d0812",
          color: "#ffffff",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 32, letterSpacing: 8, color: "#ffb7c5", fontWeight: 600 }}>
          WAGURI · HỒ SƠ
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 80, fontWeight: 600 }}>{username}</div>
        <div style={{ display: "flex", marginTop: 6, fontSize: 30, color: "#cbd5e1" }}>
          {hidden ? "Cùng Waguri làm giàu trên Discord!" : job}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 50,
            justifyContent: "space-between",
            background: "rgba(255,183,197,0.08)",
            border: "2px solid rgba(255,183,197,0.25)",
            borderRadius: 28,
            padding: "36px 60px",
          }}
        >
          <Stat label="CẤP ĐỘ" value={hidden ? "?" : `Lv.${level}`} />
          <Stat label="TÀI SẢN" value={hidden ? "?" : fmt(netWorth)} />
          <Stat label="HẠNG GIÀU" value={hidden ? "?" : `#${rank}`} />
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 28, color: "#94a3b8" }}>
          waguri-bot.vercel.app
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
}

import { ImageResponse } from "next/og";

// Ảnh chia sẻ (Open Graph) cho Discord / Top.gg / mạng xã hội.
// Dùng chữ Latin thuần (không emoji, không dấu) để satori render chắc chắn, không cần nạp font.
export const alt = "Waguri - AI Waifu & Vietnamese Economy RPG Bot for Discord";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 25% 20%, #3a1030 0%, #0d0812 55%), #0d0812",
          color: "#ffffff",
          fontFamily: "sans-serif",
          padding: "80px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 40,
            letterSpacing: 8,
            color: "#ffb7c5",
            fontWeight: 700,
          }}
        >
          WAGURI
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 86,
            fontWeight: 800,
            textAlign: "center",
            lineHeight: 1.05,
            background: "linear-gradient(90deg, #ffd3dd, #ffb7c5, #c084fc)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          AI Waifu + Economy RPG
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 34,
            color: "#cbd5e1",
            textAlign: "center",
          }}
        >
          Vietnamese Discord bot - work, jobs, games, clans, AI chat
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 56,
            fontSize: 28,
            color: "#0d0812",
            fontWeight: 700,
            background: "#ffb7c5",
            padding: "16px 40px",
            borderRadius: 999,
          }}
        >
          waguri-bot.vercel.app
        </div>
      </div>
    ),
    { ...size }
  );
}

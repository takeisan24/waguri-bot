import { ImageResponse } from "next/og";

export const runtime = "edge";

// Icon 512 cho PWA (lettermark W trên nền gradient hồng — không emoji để render chắc).
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #ffd3dd, #ffb7c5 45%, #c084fc)",
          color: "#0d0812",
          fontSize: 320,
          fontWeight: 800,
          fontFamily: "sans-serif",
        }}
      >
        W
      </div>
    ),
    { width: 512, height: 512 }
  );
}

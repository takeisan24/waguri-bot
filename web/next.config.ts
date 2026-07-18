import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy — phòng thủ nhiều lớp chống XSS/clickjacking/inject.
// Dùng cách "không nonce" (đặt thẳng ở next.config) theo doc Next 16 để GIỮ được static
// render + CDN cache (cách nonce ép mọi trang sang dynamic → chậm & tốn). Điều chỉnh cho
// nhu cầu thật của app:
//   - script/style 'unsafe-inline': Next chèn script hydrate + style inline; không có nonce
//     nên buộc phải cho phép. 'unsafe-eval' chỉ bật ở dev (React eval để dựng stack lỗi).
//   - img-src https: data:  -> avatar Discord CDN, GIF Tenor, mã VietQR, self-host.
//   - connect-src https:    -> Supabase (anon client) + host API bot (đổi qua env).
//   - font-src 'self' data: -> next/font tự host dưới /_next.
//   - frame-ancestors 'none' + object-src 'none' + base-uri/form-action 'self'.
const cspHeader = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Repo có 2 package-lock (gốc cho bot + web) -> chỉ rõ root của web để hết cảnh báo infer.
  turbopack: { root: __dirname },
  // Header bảo mật: CSP (defense-in-depth), chống clickjacking (dashboard có form đổi cấu
  // hình), sniffing, rò referrer.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

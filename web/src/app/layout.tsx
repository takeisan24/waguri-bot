import type { Metadata } from "next";
import { Nunito, Baloo_2 } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Body: Nunito (bo tròn, ấm áp) · Tiêu đề: Baloo 2 (dễ thương) — cả hai đủ dấu tiếng Việt.
const nunito = Nunito({
  variable: "--font-body",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});
const baloo = Baloo_2({
  variable: "--font-heading",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://waguri-bot.vercel.app"),
  title: "Waguri 🌸 - AI Waifu & Game Kinh Tế RPG Việt Nam",
  description: "Trò chuyện AI waifu cùng Waguri Kaoruko, trải nghiệm game kinh tế nhập vai thuần Việt (đi làm, mở nghề, minigame may rủi, lì xì, bang hội...) ngay trên server Discord của bạn!",
  keywords: ["Waguri", "Discord Bot", "Economy Bot", "RPG Bot", "AI Waifu", "Game Discord tiếng Việt", "Trò chuyện AI"],
  authors: [{ name: "takei" }],
  alternates: { canonical: "/" },
  appleWebApp: { capable: true, title: "Waguri", statusBarStyle: "black-translucent" },
  // og:image / twitter:image lấy tự động từ app/opengraph-image.tsx & twitter-image.tsx
  openGraph: {
    title: "Waguri 🌸 - AI Waifu & Game Kinh Tế RPG Việt Nam",
    description: "Trò chuyện AI waifu cùng Waguri Kaoruko, trải nghiệm game kinh tế nhập vai thuần Việt ngay trên Discord!",
    url: "https://waguri-bot.vercel.app",
    siteName: "Waguri Bot",
    locale: "vi_VN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Waguri 🌸 - AI Waifu & Game Kinh Tế RPG Việt Nam",
    description: "Trò chuyện AI waifu cùng Waguri Kaoruko, trải nghiệm game kinh tế nhập vai thuần Việt ngay trên Discord!",
  },
};

export const viewport = {
  themeColor: "#ffb7c5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${nunito.variable} ${baloo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#0a060d] text-slate-100 overflow-x-hidden">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

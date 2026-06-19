import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: "Waguri 🌸 - AI Waifu & Game Kinh Tế RPG Việt Nam",
  description: "Trò chuyện AI waifu cùng Waguri Kaoruko, trải nghiệm game kinh tế nhập vai thuần Việt (đi làm, mở nghề, cờ bạc, lì xì, bang hội...) ngay trên server Discord của bạn!",
  keywords: ["Waguri", "Discord Bot", "Economy Bot", "RPG Bot", "AI Waifu", "Game Discord tiếng Việt", "Trò chuyện AI"],
  authors: [{ name: "takei" }],
  openGraph: {
    title: "Waguri 🌸 - AI Waifu & Game Kinh Tế RPG Việt Nam",
    description: "Trò chuyện AI waifu cùng Waguri Kaoruko, trải nghiệm game kinh tế nhập vai thuần Việt ngay trên Discord!",
    url: "https://waguri.xyz",
    siteName: "Waguri Bot",
    images: [
      {
        url: "https://raw.githubusercontent.com/takeisan24/waguri-bot/master/branding/banner.png", // Dự phòng banner nếu có, hoặc ảnh anime khác
        width: 1200,
        height: 630,
        alt: "Waguri Bot Banner",
      },
    ],
    locale: "vi_VN",
    type: "website",
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
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#0a060d] text-slate-100 overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}

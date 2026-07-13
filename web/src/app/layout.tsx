import type { Metadata } from "next";
import { Nunito, Baloo_2 } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { getLocaleServer } from "../lib/i18n";
import { LanguageProvider } from "../components/LanguageProvider";
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

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleServer();
  const isEn = locale.startsWith('en');

  const title = isEn 
    ? "Waguri 🌸 - AI Waifu & RPG Economy Discord Bot" 
    : "Waguri 🌸 - AI Waifu & Game Kinh Tế RPG Việt Nam";
  const description = isEn
    ? "Chat with AI waifu Waguri Kaoruko, experience a Vietnamese-themed RPG economy game (work, professions, casual/gambling games, guild...) right on your Discord server!"
    : "Trò chuyện AI waifu cùng Waguri Kaoruko, trải nghiệm game kinh tế nhập vai thuần Việt (đi làm, mở nghề, minigame may rủi, lì xì, bang hội...) ngay trên server Discord của bạn!";
  const keywords = isEn
    ? ["Waguri", "Discord Bot", "Economy Bot", "RPG Bot", "AI Waifu", "Vietnamese Discord Game", "AI Chat"]
    : ["Waguri", "Discord Bot", "Economy Bot", "RPG Bot", "AI Waifu", "Game Discord tiếng Việt", "Trò chuyện AI"];

  return {
    metadataBase: new URL("https://waguri-bot.vercel.app"),
    title,
    description,
    keywords,
    authors: [{ name: "takei" }],
    alternates: { canonical: "/" },
    appleWebApp: { capable: true, title: "Waguri", statusBarStyle: "black-translucent" },
    openGraph: {
      title,
      description,
      url: "https://waguri-bot.vercel.app",
      siteName: "Waguri Bot",
      locale: isEn ? "en_US" : "vi_VN",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export const viewport = {
  themeColor: "#ffb7c5",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocaleServer();

  return (
    <html
      lang={locale}
      className={`${nunito.variable} ${baloo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#0a060d] text-slate-100 overflow-x-hidden">
        <LanguageProvider locale={locale}>
          {children}
        </LanguageProvider>
        <Analytics />
      </body>
    </html>
  );
}

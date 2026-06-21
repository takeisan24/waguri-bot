import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Waguri — AI Waifu & Game Kinh Tế RPG",
    short_name: "Waguri",
    description: "Discord bot kinh tế · nhập vai · AI waifu bản địa hóa Việt Nam.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0812",
    theme_color: "#ffb7c5",
    lang: "vi",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/pwa-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

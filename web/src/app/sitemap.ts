import type { MetadataRoute } from "next";

const BASE = "https://waguri-bot.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/commands", "/wiki", "/leaderboard", "/changelog", "/status", "/tos", "/privacy"].map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}

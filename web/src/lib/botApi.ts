// Host API công khai của bot (profile/leaderboard/stats do src/lib/voteServer.js phục vụ).
// Đổi host 1 chỗ qua env NEXT_PUBLIC_BOT_API thay vì hard-code rải rác.
export const BOT_API = (process.env.NEXT_PUBLIC_BOT_API || "https://waguribot.wispbyte.app").replace(/\/+$/, "");

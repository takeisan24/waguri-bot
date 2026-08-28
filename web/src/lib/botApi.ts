// Host API công khai của bot (profile/leaderboard/stats do src/lib/voteServer.js phục vụ).
// Đổi host 1 chỗ qua env NEXT_PUBLIC_BOT_API thay vì hard-code rải rác.
//
// ⚠️ HAI HẰNG SỐ, DÙNG CHO HAI PHÍA KHÁC NHAU — chọn nhầm là hỏng im lặng.
//
// Trang web chạy HTTPS (Vercel). Nếu `NEXT_PUBLIC_BOT_API` trỏ tới một địa chỉ HTTP
// (`http://<ip>:15247`), thì:
//   · fetch từ MÁY CHỦ  -> chạy bình thường, không vướng luật nào
//   · fetch từ TRÌNH DUYỆT -> bị CHẶN CỨNG vì mixed content, và chặn IM LẶNG: không có lỗi
//     nào hiện ra trong giao diện, widget chỉ đơn giản không bao giờ hiện.
//
// Vì vậy phía trình duyệt phải đi qua cầu nối cùng nguồn `/api/bot/*`
// (`web/src/app/api/bot/[...path]/route.ts`), nơi chặng HTTP nằm giữa hai máy chủ.
export const BOT_API = (process.env.NEXT_PUBLIC_BOT_API || "https://waguribot.wispbyte.app").replace(/\/+$/, "");

/**
 * Tiền tố cho MỌI lời gọi phát ra từ trình duyệt (`"use client"`).
 *
 * Cùng nguồn nên luôn là HTTPS, bất kể `NEXT_PUBLIC_BOT_API` trỏ đi đâu — và nhờ vậy đổi
 * host của bot không còn kéo theo rủi ro mixed content.
 */
export const BOT_API_CLIENT = "/api/bot";

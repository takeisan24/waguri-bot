// lib/alert.ts — Bắn cảnh báo VẬN HÀNH về một kênh Discord qua webhook (env ORDER_ALERT_WEBHOOK).
//
// VÌ SAO CẦN: luồng Premium duyệt THỦ CÔNG. Người mua chuyển khoản xong bấm "Tôi đã
// chuyển khoản" -> trước đây việc đó chỉ ghi `claimed_at` vào DB và KHÔNG báo cho ai cả.
// Owner chỉ biết khi tình cờ gõ `/premium-admin cho`. Người vừa trả tiền là người dễ mất
// niềm tin nhất, nên khoảng lặng đó là lỗi đắt nhất của cả luồng.
//
// No-op nếu chưa đặt env. TUYỆT ĐỐI không ném lỗi: cảnh báo hỏng không được phép làm
// hỏng luồng thanh toán đang chạy.
export async function alertOwner(
  title: string,
  description: string,
  color = 0xff8e9e
): Promise<void> {
  const url = process.env.ORDER_ALERT_WEBHOOK;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [{ title, description, color }] }),
      // Vercel serverless: webhook treo không được giữ server action lại.
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    /* nuốt lỗi — xem chú thích đầu file */
  }
}

/**
 * Báo cho BOT rằng người mua vừa bấm "Tôi đã chuyển khoản".
 *
 * VÌ SAO ĐI VÒNG QUA BOT thay vì bắn thẳng webhook Discord: webhook Discord thuần KHÔNG
 * đính được components — chỉ ứng dụng mới gửi được nút bấm. Mà cả luồng này tồn tại là vì
 * nút: tài khoản nhận tiền là VCB cá nhân, không có webhook ngân hàng, nên owner phải
 * duyệt tay MỌI đơn. Bắt owner gõ lệnh trên điện thoại là chỗ luồng chết trong thực tế.
 *
 * @returns true nếu bot đã nhận (khi đó caller KHÔNG cần bắn webhook dự phòng nữa).
 */
export async function notifyBotOfClaim(code: string): Promise<boolean> {
  const secret = process.env.BOT_NOTIFY_SECRET;
  const base = (process.env.NEXT_PUBLIC_BOT_API || "").replace(/\/+$/, "");
  if (!secret || !base) return false;
  try {
    const r = await fetch(`${base}/premium/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-waguri-secret": secret },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch {
    return false; // bot đang ngủ/mất mạng -> caller rơi xuống webhook dự phòng
  }
}

import crypto from "crypto";

// Tích hợp PayOS (server-only). Tạo link thanh toán -> redirect user sang trang VietQR của PayOS.
// Docs: https://payos.vn/docs — ký HMAC-SHA256 bằng checksumKey.
const PAYOS_BASE = "https://api-merchant.payos.vn";

// Chữ ký cho tạo đơn: ký theo ĐÚNG thứ tự amount, cancelUrl, description, orderCode, returnUrl.
function createSignature(
  o: { amount: number; cancelUrl: string; description: string; orderCode: number; returnUrl: string },
  checksumKey: string,
): string {
  const str =
    `amount=${o.amount}&cancelUrl=${o.cancelUrl}&description=${o.description}` +
    `&orderCode=${o.orderCode}&returnUrl=${o.returnUrl}`;
  return crypto.createHmac("sha256", checksumKey).update(str).digest("hex");
}

export function payosConfigured(): boolean {
  return !!(process.env.PAYOS_CLIENT_ID && process.env.PAYOS_API_KEY && process.env.PAYOS_CHECKSUM_KEY);
}

// Tạo link thanh toán PayOS. Trả checkoutUrl (trang VietQR của PayOS) hoặc null nếu lỗi/chưa cấu hình.
export async function createPayosPayment(opts: {
  orderCode: number;
  amount: number;
  description: string; // <= 25 ký tự, sẽ được echo lại trong webhook
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ checkoutUrl: string } | null> {
  const clientId = process.env.PAYOS_CLIENT_ID;
  const apiKey = process.env.PAYOS_API_KEY;
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY;
  if (!clientId || !apiKey || !checksumKey) return null;

  const signature = createSignature(opts, checksumKey);
  try {
    const res = await fetch(`${PAYOS_BASE}/v2/payment-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-client-id": clientId, "x-api-key": apiKey },
      body: JSON.stringify({ ...opts, signature }),
      cache: "no-store",
    });
    const j = await res.json();
    if (j.code !== "00" || !j.data?.checkoutUrl) {
      console.error("[PAYOS] create payment fail:", j.code, j.desc);
      return null;
    }
    return { checkoutUrl: j.data.checkoutUrl };
  } catch (e) {
    console.error("[PAYOS] create payment error:", e);
    return null;
  }
}

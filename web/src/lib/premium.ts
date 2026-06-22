// Gói Premium bán qua VietQR (TK Vietcombank) + xác nhận tự động bằng Casso.
// Đồng bộ với bot: src/config/index.js -> PREMIUM.PLANS.
export type PlanId = "m1" | "m3" | "m6";

export const PREMIUM_PLANS: Record<PlanId, { months: number; amount: number; label: string; note: string }> = {
  m1: { months: 1, amount: 25000, label: "1 tháng", note: "Dùng thử thoải mái" },
  m3: { months: 3, amount: 60000, label: "3 tháng", note: "~20k/tháng · tiết kiệm 20%" },
  m6: { months: 6, amount: 99000, label: "6 tháng", note: "~16.5k/tháng · tiết kiệm 34%" },
};

export const PLAN_ORDER: PlanId[] = ["m1", "m3", "m6"];

export function isPlanId(v: string): v is PlanId {
  return v === "m1" || v === "m3" || v === "m6";
}

// Ảnh VietQR chuẩn quốc gia (img.vietqr.io, không cần tài khoản bên thứ ba) trỏ vào TK Vietcombank.
export function vietqrUrl(amount: number, memo: string): string {
  const acc = process.env.VCB_ACCOUNT || "";
  const bank = process.env.VCB_BANK || "VCB"; // mã ngắn 'VCB' hoặc BIN '970436'
  const name = process.env.VCB_HOLDER || "";
  const p = new URLSearchParams({ amount: String(amount), addInfo: memo, accountName: name });
  return `https://img.vietqr.io/image/${bank}-${acc}-compact2.png?${p.toString()}`;
}

export const VCB_INFO = {
  account: () => process.env.VCB_ACCOUNT || "",
  bank: () => "Vietcombank",
  holder: () => process.env.VCB_HOLDER || "",
};

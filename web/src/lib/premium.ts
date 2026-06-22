// Gói Premium bán qua PayOS (VietQR). Đồng bộ với bot: src/config/index.js -> PREMIUM.PLANS.
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

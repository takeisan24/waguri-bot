"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../lib/discord";
import { PREMIUM_PLANS, isPlanId } from "../../../lib/premium";
import { createPayosPayment } from "../../../lib/payos";

// Tạo đơn Premium -> tạo link PayOS -> chuyển user sang trang VietQR của PayOS.
export async function createPremiumOrder(plan: string) {
  if (!isPlanId(plan)) return;
  const def = PREMIUM_PLANS[plan];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { id } = getDiscordIdentity(user);
  if (!id) redirect("/login");

  const admin = createAdminClient();
  const { data: order, error } = await admin.rpc("create_premium_order", {
    p_user: id,
    p_plan: plan,
    p_months: def.months,
    p_amount: def.amount,
  });
  if (error || !order?.code || !order?.id) redirect("/dashboard/premium?error=order");

  const h = await headers();
  const origin = process.env.WEB_URL || `https://${h.get("host")}`;
  const pay = await createPayosPayment({
    orderCode: Number(order.id),
    amount: def.amount,
    description: order.code, // <=25 ký tự, PayOS echo lại trong webhook để khớp đơn
    returnUrl: `${origin}/dashboard/premium/pay/${order.code}`,
    cancelUrl: `${origin}/dashboard/premium?canceled=1`,
  });
  if (!pay) redirect(`/dashboard/premium/pay/${order.code}?error=gateway`);

  redirect(pay.checkoutUrl); // sang trang thanh toán PayOS (VietQR + trạng thái)
}

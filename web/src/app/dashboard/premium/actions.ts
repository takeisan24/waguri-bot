"use server";

import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../lib/discord";
import { PREMIUM_PLANS, isPlanId } from "../../../lib/premium";

// Tạo đơn mua Premium rồi chuyển sang trang thanh toán (hiện VietQR).
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
  const { data, error } = await admin.rpc("create_premium_order", {
    p_user: id,
    p_plan: plan,
    p_months: def.months,
    p_amount: def.amount,
  });
  if (error || !data?.code) redirect("/dashboard/premium?error=order");

  redirect(`/dashboard/premium/pay/${data.code}`);
}

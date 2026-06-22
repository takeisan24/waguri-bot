"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../lib/discord";
import { PREMIUM_PLANS, isPlanId } from "../../../lib/premium";

// Tạo đơn mua Premium rồi chuyển sang trang thanh toán (hiện VietQR Vietcombank).
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

// Buyer bấm "Tôi đã chuyển khoản" -> đánh dấu để owner kiểm tra & duyệt (thanh toán VCB thủ công).
export async function claimPremiumOrder(code: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { id } = getDiscordIdentity(user);
  if (!id) redirect("/login");

  const admin = createAdminClient();
  await admin
    .from("premium_orders")
    .update({ claimed_at: new Date().toISOString() })
    .eq("code", code)
    .eq("user_id", id)
    .eq("status", "pending");

  revalidatePath(`/dashboard/premium/pay/${code}`);
}

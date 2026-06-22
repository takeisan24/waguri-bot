import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../../lib/discord";

export const dynamic = "force-dynamic";

// Trang thanh toán poll endpoint này để biết đơn đã được PayOS xác nhận chưa.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "unauth" }, { status: 401 });
  const { id } = getDiscordIdentity(user);
  if (!id) return NextResponse.json({ status: "unauth" }, { status: 401 });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("premium_orders")
    .select("user_id, status")
    .eq("code", code)
    .single();

  // Chỉ chủ đơn mới xem được trạng thái.
  if (!order || order.user_id !== id) return NextResponse.json({ status: "notfound" }, { status: 404 });

  return NextResponse.json({ status: order.status });
}

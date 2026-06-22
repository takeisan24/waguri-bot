import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../../../lib/discord";
import { fmtVND } from "../../../../../lib/game";
import PayStatus from "./PayStatus";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thanh toán Premium 💎", robots: { index: false } };

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { id } = getDiscordIdentity(user);
  if (!id) redirect("/login");

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("premium_orders")
    .select("code, user_id, months, amount, status")
    .eq("code", code)
    .single();

  // Đơn không tồn tại hoặc không phải của mình -> về trang giá.
  if (!order || order.user_id !== id) redirect("/dashboard/premium");
  const paid = order.status === "paid";

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0812] text-slate-200">
      <header className="w-full max-w-xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="text-xl font-black text-glow tracking-wider text-pink-300">
          WAGURI <span className="text-pink-400">🌸</span>
        </Link>
        <Link href="/dashboard/premium" className="text-xs font-bold text-slate-400 hover:text-pink-300">
          ← Đổi gói
        </Link>
      </header>

      <main className="flex-1 w-full max-w-xl mx-auto px-6 py-6">
        {paid ? (
          <div className="glass-panel rounded-3xl p-8 text-center border border-emerald-400/30 space-y-3">
            <p className="text-5xl">🎉</p>
            <h1 className="text-2xl font-black text-white">Thanh toán thành công!</h1>
            <p className="text-emerald-300 text-sm">
              Đã kích hoạt Premium 💎 +{order.months} tháng. Waguri cảm ơn cậu nhiều lắm~ 🌸
            </p>
            <Link
              href="/dashboard"
              className="inline-block mt-2 px-5 py-2.5 rounded-full bg-pink-500 text-white text-sm font-bold hover:bg-pink-400"
            >
              Về Dashboard →
            </Link>
          </div>
        ) : error === "gateway" ? (
          <div className="glass-panel rounded-3xl p-8 text-center border border-amber-400/30 space-y-3">
            <p className="text-4xl">⚠️</p>
            <h1 className="text-xl font-black text-white">Chưa tạo được thanh toán</h1>
            <p className="text-amber-200 text-sm">Cổng PayOS chưa sẵn sàng (thiếu cấu hình hoặc lỗi tạm thời). Thử lại sau nhé!</p>
            <Link
              href="/dashboard/premium"
              className="inline-block mt-2 px-5 py-2.5 rounded-full border border-pink-300/30 text-pink-200 text-sm font-bold hover:border-pink-300/60"
            >
              ← Quay lại chọn gói
            </Link>
          </div>
        ) : (
          <div className="glass-panel rounded-3xl p-7 border border-pink-300/20 space-y-5 text-center">
            <h1 className="text-xl font-black text-white">Đang chờ thanh toán</h1>
            <p className="text-pink-200/80 text-sm">
              Gói {order.months} tháng · <span className="font-bold text-white">{fmtVND(order.amount)}đ</span>
            </p>
            <p className="text-sm text-slate-400">
              Hoàn tất chuyển khoản ở trang PayOS (VietQR). Khi tiền vào, mục này tự chuyển sang{" "}
              <span className="text-emerald-300 font-semibold">thành công</span> trong vài giây 💝
            </p>

            <PayStatus code={order.code} />

            <p className="text-xs text-slate-500">
              Lỡ đóng trang PayOS?{" "}
              <Link href="/dashboard/premium" className="text-pink-300 hover:underline">
                tạo lại đơn
              </Link>{" "}
              nhé.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../../../lib/discord";
import { fmtVND } from "../../../../../lib/game";
import { sepayQrUrl, SEPAY_INFO } from "../../../../../lib/premium";
import PayStatus from "./PayStatus";
import CopyHint from "./CopyHint";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thanh toán Premium 💎", robots: { index: false } };

export default async function PayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
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
  const acc = SEPAY_INFO.account();
  const bank = SEPAY_INFO.bank();
  const holder = SEPAY_INFO.holder();

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
        ) : !acc ? (
          <div className="glass-panel rounded-3xl p-8 text-center border border-amber-400/30 text-amber-200 text-sm">
            ⚠️ Cổng thanh toán chưa được cấu hình (thiếu tài khoản nhận). Liên hệ owner nhé!
          </div>
        ) : (
          <div className="glass-panel rounded-3xl p-6 sm:p-7 border border-pink-300/20 space-y-5">
            <div className="text-center">
              <h1 className="text-xl font-black text-white">Quét mã để thanh toán</h1>
              <p className="text-pink-200/80 text-sm mt-1">
                Gói {order.months} tháng ·{" "}
                <span className="font-bold text-white">{fmtVND(order.amount)}đ</span>
              </p>
            </div>

            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sepayQrUrl(order.amount, order.code)}
                alt="VietQR thanh toán Premium"
                width={256}
                height={256}
                className="rounded-2xl bg-white p-2 w-64 h-64 object-contain"
              />
            </div>

            <div className="rounded-2xl bg-[#1c1424] p-4 text-sm space-y-2">
              <Row label="Ngân hàng" value={bank} />
              <Row label="Số tài khoản" value={acc} copy />
              {holder ? <Row label="Chủ tài khoản" value={holder} /> : null}
              <Row label="Số tiền" value={`${fmtVND(order.amount)}đ`} copy copyValue={String(order.amount)} />
              <Row label="Nội dung CK" value={order.code} copy highlight />
            </div>

            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              ⚠️ <b>Bắt buộc</b> giữ đúng nội dung <b>{order.code}</b> và đúng số tiền để Waguri tự nhận diện. Sai
              nội dung sẽ không tự kích hoạt được.
            </p>

            <PayStatus code={order.code} />
          </div>
        )}
      </main>
    </div>
  );
}

function Row({
  label,
  value,
  copy,
  copyValue,
  highlight,
}: {
  label: string;
  value: string;
  copy?: boolean;
  copyValue?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`font-bold ${highlight ? "text-pink-300" : "text-white"}`}>
        {value}
        {copy ? <CopyHint text={copyValue ?? value} /> : null}
      </span>
    </div>
  );
}

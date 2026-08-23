"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../lib/discord";
import { isOwnerId } from "../../../lib/owner";
import { PREMIUM_PLANS, isPlanId } from "../../../lib/premium";
import { alertOwner, notifyBotOfClaim } from "../../../lib/alert";
import { ghiLoi } from "../../../lib/ghiLoi";

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

  // M11: Giới hạn tối đa 5 hóa đơn 'pending' để chống spam.
  //
  // CHỈ ĐẾM ĐƠN TRONG 24h QUA. Trước đây đếm MỌI đơn pending, mà đơn pending thì không
  // bao giờ hết hạn và không có job dọn -> ai xem thử cả 3 gói rồi đổi ý vài lần là bị
  // KHOÁ MUA VĨNH VIỄN. Đơn cũ vẫn giữ nguyên trong bảng để đối soát, chỉ là không còn
  // tính vào hạn mức nữa.
  const CUA_SO_HAN_MUC_MS = 24 * 60 * 60 * 1000;
  const { data: pendingOrders, error: loi } = await admin
    .from("premium_orders")
    .select("code")
    .eq("user_id", id)
    .eq("status", "pending")
    .gte("created_at", new Date(Date.now() - CUA_SO_HAN_MUC_MS).toISOString())
    .limit(6);
  ghiLoi("dashboard/premium", loi);

  if (pendingOrders && pendingOrders.length >= 5) {
    redirect("/dashboard/premium?error=too_many_pending");
  }

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
  // `.is("claimed_at", null)` biến đây thành phép CHUYỂN TRẠNG THÁI MỘT LẦN: bấm lại
  // không update và không bắn cảnh báo trùng. `.select()` cho biết có đúng 1 dòng vừa đổi.
  const { data: vuaBao, error: loiBao } = await admin
    .from("premium_orders")
    .update({ claimed_at: new Date().toISOString() })
    .eq("code", code)
    .eq("user_id", id)
    .eq("status", "pending")
    .is("claimed_at", null)
    .select("code, plan, months, amount")
    .maybeSingle();

  // Đây là chỗ im lặng ĐẮT NHẤT của cả dự án, nên nó không được phép chỉ ghi log.
  //
  // Bản cũ chỉ lấy `data`. Lệnh UPDATE hỏng -> `vuaBao` null -> mã rơi vào ĐÚNG nhánh của
  // "đã bấm rồi": không ghi gì, không báo owner, không báo người mua. Người vừa chuyển
  // tiền thật bấm nút, thấy màn hình bình thường, rồi chờ mãi một lời duyệt không bao giờ
  // tới. Không ai biết để sửa, kể cả owner.
  //
  // Phân biệt rõ: `vuaBao == null && !loiBao` là "đã bấm rồi" (bình thường, im lặng đúng);
  // `loiBao` là hỏng thật -> báo owner NGAY để họ đối soát tay, và ném lại cho người mua
  // biết mà bấm lại.
  if (loiBao) {
    ghiLoi("premium/claim", loiBao);
    await alertOwner(
      "🚨 Người mua bấm 'đã chuyển khoản' nhưng GHI NHẬN HỎNG",
      [
        `**Mã đơn:** \`${code}\``,
        `**Người mua:** <@${id}> (\`${id}\`)`,
        `**Lỗi:** ${loiBao.message}`,
        "",
        "Đơn KHÔNG được đánh dấu. Vào app ngân hàng đối soát nội dung chuyển khoản theo mã đơn rồi duyệt tay.",
      ].join("\n"),
      0xed4245
    );
    redirect(`/dashboard/premium/pay/${code}?error=claim_failed`);
  }

  if (vuaBao) {
    // Ưu tiên báo qua BOT: chỉ bot mới đính được NÚT duyệt vào tin nhắn, và nút là thứ
    // biến việc duyệt tay thành 2 chạm trên điện thoại. Bot chết (host free hay ngủ) thì
    // rơi xuống webhook Discord thuần — không có nút, nhưng ít nhất owner vẫn được báo.
    const botDaBao = await notifyBotOfClaim(vuaBao.code);
    if (!botDaBao) await alertOwner(
      "💸 Có người báo đã chuyển khoản Premium",
      [
        `**Mã đơn:** \`${vuaBao.code}\``,
        `**Số tiền:** ${Number(vuaBao.amount).toLocaleString("vi-VN")}đ · gói ${vuaBao.plan} (${vuaBao.months} tháng)`,
        `**Người mua:** <@${id}> (\`${id}\`)`,
        "",
        "Đối chiếu nội dung CK trong app ngân hàng rồi duyệt:",
        `→ Discord: \`/premium-admin duyet ma:${vuaBao.code}\` (bot sẽ DM cảm ơn họ)`,
        "→ Web: /dashboard/premium/admin",
      ].join("\n"),
      0x57f287
    );
  }

  revalidatePath(`/dashboard/premium/pay/${code}`);
}

// Owner duyệt đơn ngay trên web (kích hoạt Premium, bỏ qua kiểm tra số tiền — đã tự đối chiếu).
export async function approvePremiumOrderWeb(code: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { id } = getDiscordIdentity(user);
  if (!isOwnerId(id)) redirect("/dashboard"); // chỉ owner

  const admin = createAdminClient();

  // Duyệt đơn KHÔNG được phép im lặng, ở CẢ HAI tầng:
  //
  //   · `error`      — lỗi truyền tải (mạng, quyền, RPC không tồn tại)
  //   · `data.ok`    — kết quả nghiệp vụ. Hàm trả jsonb và có thể nói `ok:false` với
  //                    `reason` là not_found / wrong_kind (đơn ủng hộ không cấp được tháng).
  //
  // Bản cũ `await` trần, bỏ cả hai. Owner bấm "duyệt", màn hình làm mới, và họ TIN là xong.
  // Người trả tiền thì không nhận được gì. Không ai biết để sửa — đúng kiểu im lặng đắt nhất,
  // chỉ khác là lần này nạn nhân là cả hai phía.
  const { data, error } = await admin.rpc("approve_premium_order", { p_code: code, p_ref: `web:${id}` });
  const ok = !error && (data as { ok?: boolean } | null)?.ok === true;
  if (!ok) {
    ghiLoi("premium/duyet", error ?? { message: `RPC từ chối: ${JSON.stringify(data)}` });
    await alertOwner(
      "🚨 Duyệt đơn Premium KHÔNG thành công",
      [
        `**Mã đơn:** \`${code}\``,
        `**Người duyệt:** <@${id}>`,
        `**Lý do:** ${error ? error.message : (data as { reason?: string } | null)?.reason ?? "không rõ"}`,
        "",
        "Đơn CHƯA được kích hoạt. Kiểm lại mã đơn rồi duyệt lại.",
      ].join("\n"),
      0xed4245
    );
    redirect("/dashboard/premium/admin?error=approve_failed");
  }

  revalidatePath("/dashboard/premium/admin");
}


"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";
import { createAdminClient } from "../../lib/supabase/admin";
import { getDiscordIdentity } from "../../lib/discord";
import { getLocaleServer } from "../../lib/i18n";
import { ghiLoi } from "../../lib/ghiLoi";

// Lấy Discord ID của phiên đăng nhập đã xác thực (không tin tham số từ client).
async function sessionDiscordId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return getDiscordIdentity(user).id;
}

// Cả hai nút bật/tắt đi qua RPC `toggle_user_flag` (0135) — MỘT lệnh UPDATE, không đọc trước.
//
// Bản cũ đọc rồi ghi: `const { data } = await ...select(...)` (bỏ `error`), rồi
// `!((data?.profile_public ?? true))`. Đọc hỏng một nhịp là `data` null, `?? true` cho ra
// true, `next` thành false, và hồ sơ người dùng bị ghi thành ẨN — bất kể trạng thái thật.
// Người dùng không bấm gì sai, không thấy lỗi nào, chỉ là quyền riêng tư tự đổi.
//
// Thêm một nhánh nữa: `.single()` ném lỗi khi chưa có dòng nào (người đăng nhập web mà chưa
// từng dùng bot), nên nút bấm im lặng không làm gì.
async function latCo(flag: "profile_public" | "vote_reminder") {
  const id = await sessionDiscordId();
  if (!id) return;
  const admin = createAdminClient();
  const { error } = await admin.rpc("toggle_user_flag", { p_user: id, p_flag: flag });
  if (ghiLoi(`dashboard/lat-co:${flag}`, error)) return; // hỏng thì KHÔNG revalidate — giữ nguyên màn hình cũ
  revalidatePath("/dashboard");
}

export async function toggleProfilePublic() {
  await latCo("profile_public");
}

export async function toggleVoteReminder() {
  await latCo("vote_reminder");
}

export async function upgradePetSkill(skillId: string) {
  const userId = await sessionDiscordId();
  const locale = await getLocaleServer();
  const isEn = locale.startsWith("en");

  if (!userId) {
    return { success: false, error: isEn ? "Unauthorized session" : "Phiên làm việc chưa xác thực" };
  }

  const admin = createAdminClient();

  // Toàn bộ "kiểm điểm -> kiểm cấp trần -> trừ điểm -> nâng cấp" nằm TRONG một RPC
  // khoá hàng (migration 0109). Lối cũ đọc pet rồi ghi đè CẢ KHỐI `skills` ở đây:
  //   · bấm đúp / mở 2 tab / dùng web và bot cùng lúc -> cùng đọc skill_points = 1,
  //     cùng ghi 0 với kỹ năng của riêng mình => 2 cấp kỹ năng cho 1 điểm
  //   · ghi đè nguyên khối còn xoá mất thay đổi mà bot vừa ghi (lost update)
  // Allow-list kỹ năng + cấp trần nay nằm TRONG RPC, nên bot và web dùng chung một
  // nguồn sự thật thay vì mỗi bên tự nhớ.
  const { data: res, error } = await admin.rpc("upgrade_pet_skill", {
    p_user: userId,
    p_skill: skillId,
  });

  if (error) {
    console.error("[UPGRADE PET SKILL ERROR]", error);
    return { success: false, error: isEn ? "Failed to update database" : "Lưu vào cơ sở dữ liệu thất bại" };
  }

  const status = (res as { status?: string } | null)?.status;
  if (status !== "ok") {
    const errMap: Record<string, string> = isEn
      ? {
          no_pet: "Pet not found",
          no_points: "No skill points available",
          max_level: "Skill already at maximum level",
          bad_skill: "Unknown skill",
        }
      : {
          no_pet: "Không tìm thấy thú cưng",
          no_points: "Hết điểm kỹ năng rồi cậu ơi",
          max_level: "Kỹ năng đã đạt cấp tối đa",
          bad_skill: "Kỹ năng không hợp lệ",
        };
    return { success: false, error: errMap[status ?? ""] ?? (isEn ? "Unknown error" : "Lỗi không xác định") };
  }

  revalidatePath("/dashboard/pet");
  revalidatePath("/dashboard");
  return { success: true };
}

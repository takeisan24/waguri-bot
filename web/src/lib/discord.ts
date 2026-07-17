import type { User } from "@supabase/supabase-js";

// Trích Discord ID/tên/avatar từ phiên Supabase (provider = discord).
// Discord ID = user_id trong DB game của bot.
export function getDiscordIdentity(user: User | null) {
  if (!user) return { id: null as string | null, username: "Người chơi", avatar: null as string | null };
  const identity = (user.identities || []).find((i) => i.provider === "discord");
  const idata = (identity?.identity_data || {}) as Record<string, unknown>;
  const m = (user.user_metadata || {}) as Record<string, unknown>;

  // BẢO MẬT: ID chỉ được lấy từ `identities[]` — do Supabase ghi từ OAuth provider,
  // client KHÔNG sửa được. TUYỆT ĐỐI không đọc ID từ `user_metadata`: người dùng đã
  // đăng nhập tự ghi được nó bằng `supabase.auth.updateUser({ data })`, nên đọc từ đó
  // cho phép mạo danh Discord ID bất kỳ (tiêu tiền/nhận thưởng của người khác) và tự
  // đặt mình thành OWNER_IDS để duyệt đơn Premium miễn phí.
  // Thiếu identity -> id = null (fail-closed: call-site coi như chưa đăng nhập).
  const id =
    (idata.provider_id as string) ||
    (idata.sub as string) ||
    identity?.id ||
    null;

  // Tên & avatar chỉ dùng để HIỂN THỊ (không dùng phân quyền). Vẫn ưu tiên identity_data
  // để tránh mạo danh tên trên trang hồ sơ công khai; user_metadata chỉ là fallback.
  const username =
    (idata.full_name as string) ||
    (idata.name as string) ||
    (idata.user_name as string) ||
    (idata.preferred_username as string) ||
    (m.full_name as string) ||
    (m.name as string) ||
    (m.user_name as string) ||
    (m.preferred_username as string) ||
    "Người chơi";

  const avatar =
    (idata.avatar_url as string) ||
    (idata.picture as string) ||
    (m.avatar_url as string) ||
    (m.picture as string) ||
    null;

  return { id: id ? String(id) : null, username, avatar };
}

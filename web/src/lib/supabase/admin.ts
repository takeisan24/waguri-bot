import { createClient } from "@supabase/supabase-js";

// Client SERVICE-ROLE để đọc/ghi dữ liệu game (bypass RLS). CHỈ DÙNG Ở SERVER.
// Luôn lọc theo Discord ID của phiên đăng nhập đã xác thực — không bao giờ tin tham số từ client.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  // FAIL-LOUD: nếu thiếu service key, KHÔNG âm thầm tụt xuống anon key (sẽ chạy dưới RLS ->
  // các thao tác "admin" như duyệt premium, ghi cờ guild... im lặng thất bại và code hiểu nhầm
  // "DB rỗng"). Ở production phải ném lỗi; ở dev chỉ cảnh báo để còn chạy local được.
  if (!serviceKey) {
    const msg =
      "[admin] Thiếu SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY — admin client cần service-role để bypass RLS.";
    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    }
    console.warn(msg + " (dev: tạm dùng anon key)");
  }

  const key =
    serviceKey ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return createClient(url || "", key || "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

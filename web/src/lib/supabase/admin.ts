import { createClient } from "@supabase/supabase-js";

// Client SERVICE-ROLE để đọc/ghi dữ liệu game (bypass RLS). CHỈ DÙNG Ở SERVER.
// Luôn lọc theo Discord ID của phiên đăng nhập đã xác thực — không bao giờ tin tham số từ client.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return createClient(
    url || "",
    key || "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

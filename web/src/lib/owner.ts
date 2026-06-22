// Gate quyền owner trên web (đồng bộ với bot qua env OWNER_IDS — danh sách Discord ID, ngăn bởi dấu phẩy).
export function isOwnerId(id: string | null | undefined): boolean {
  if (!id) return false;
  return (process.env.OWNER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(id);
}

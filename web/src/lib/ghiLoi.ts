// lib/ghiLoi.ts — một chỗ duy nhất để ghi lỗi truy vấn của tầng web.
//
// VÌ SAO CẦN: rà ngày 2026-08-23 tìm ra 19 truy vấn viết `const { data } = await admin...`
// — chỉ lấy `data`, bỏ `error`. Hậu quả không phải "sập" mà là "rỗng": PostgREST trả lỗi,
// `data` thành null, và giao diện hiện danh sách trống trông y hệt "chưa có dữ liệu".
//
// Đó chính là cơ chế đã giấu ba lỗi thật suốt thời gian dài:
//   · bảng xếp hạng tiệm bánh luôn rỗng (select cột `bakery_score` không tồn tại)
//   · trang battle pass hiện mã vật phẩm thô (select cột `items.emoji` không tồn tại)
//   · và cùng một truy vấn sai được chép ra hai file, nên vá một chỗ vẫn còn chỗ kia
//
// Không có cách nào phân biệt "hỏng" với "chưa có dữ liệu" từ bên ngoài. Chỉ log mới thấy.
//
// TIỀN TỐ `[web]` là cố ý: nó làm mọi lỗi tầng web thành một chuỗi grep được trong log
// Vercel, thay vì lẫn vào hàng trăm dòng khác.
//
// KHÔNG bắn cảnh báo Discord ở đây. `alertOwner()` phải `await` tới 4 giây, và nhét nó vào
// đường ĐỌC của mọi trang là tự thêm độ trễ cho từng lượt xem, cộng nguy cơ spam kênh khi
// DB chớp một nhịp. Cảnh báo Discord dành riêng cho đường TIỀN, nơi im lặng mới thật sự đắt.

type LoiSupabase = { message?: string; code?: string; details?: string } | null | undefined;

/**
 * Ghi lỗi truy vấn nếu có. An toàn khi `error` là null — gọi vô điều kiện được.
 *
 * @param cho  Nơi xảy ra, dạng "trang/việc" để grep được. Ví dụ: "dashboard/pet".
 * @param loi  Trường `error` mà supabase-js trả về.
 * @returns    true nếu CÓ lỗi — tiện cho `if (ghiLoi(...)) return;`
 */
export function ghiLoi(cho: string, loi: LoiSupabase): boolean {
    if (!loi) return false;
    const ma = loi.code ? ` (${loi.code})` : "";
    console.error(`[web] ${cho}: ${loi.message ?? "lỗi không rõ"}${ma}`);
    return true;
}

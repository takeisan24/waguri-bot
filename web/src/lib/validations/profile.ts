import { z } from "zod";

// 1, Định nghĩa Zod Schema cho dữ liệu của Profile
export const profileSchema = z.object({
    bio: z
        .string()
        .max(150, "Tiểu sử (Bio) không được vượt quá 150 kí tự đâu nhen >.<") //TODO: Add I18N
        .optional() // Cho phép để trống (Optional)
        .or(z.literal("")), // Cho phép chuỗi rỗng
    showcaseBadges: z
        .array(z.string())
        .max(6, "Chỉ được chọn tối đa 6 huy hiệu để trưng bày thôi nhé >.<"),//TODO: Add I18N
});

// 2, Tự động suy luận ra type từ Zod Schema cho Typescript
export type ProfileFormValues = z.infer<typeof profileSchema>;
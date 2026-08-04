import { z } from "zod";

export const profileSchema = z.object({
    bio: z
        .string()
        .max(150, "profile_edit.error_bio_too_long")
        .optional()
        .or(z.literal("")),
    showcaseBadges: z
        .array(z.string())
        .max(6, "profile_edit.error_too_many_badges"),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

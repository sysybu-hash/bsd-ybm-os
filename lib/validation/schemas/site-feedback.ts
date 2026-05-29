import { z } from "zod";

export const SITE_FEEDBACK_MESSAGE_MIN = 10;

export const siteFeedbackSchema = z.object({
  name: z.string().trim().min(1, "name_required").max(120),
  email: z.string().trim().email("email_invalid").max(254),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  message: z
    .string()
    .trim()
    .min(SITE_FEEDBACK_MESSAGE_MIN, "message_too_short")
    .max(4000),
  pageUrl: z.string().trim().url("page_url_invalid").max(2048).optional(),
  context: z.enum(["marketing", "app"]).optional(),
});

export type SiteFeedbackInput = z.infer<typeof siteFeedbackSchema>;

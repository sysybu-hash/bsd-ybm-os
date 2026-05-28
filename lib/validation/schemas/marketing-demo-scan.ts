import { z } from "zod";
import { PRIMARY_UI_LOCALES } from "@/lib/i18n/config";
import { MARKETING_DEMO_SCAN_MAX_BYTES } from "@/lib/marketing/demo-scan/constants";

const allowedMime = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"] as const;

export const marketingDemoScanBodySchema = z.object({
  locale: z.enum(PRIMARY_UI_LOCALES).optional(),
  fileName: z.string().min(1).max(200),
  mimeType: z.enum(allowedMime),
  imageBase64: z
    .string()
    .min(32)
    .max(Math.ceil((MARKETING_DEMO_SCAN_MAX_BYTES * 4) / 3) + 256),
});

export type MarketingDemoScanBody = z.infer<typeof marketingDemoScanBodySchema>;

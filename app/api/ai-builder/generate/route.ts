import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { generateUiSchemaFromPrompt } from "@/lib/app-builder/generate-ui-schema";
import { jsonBadRequest, jsonServiceUnavailable, jsonTooManyRequests } from "@/lib/api-json";
import { getServerLocale } from "@/lib/i18n/server";
import { createLogger } from "@/lib/logger";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = createLogger("ai-app-builder");

const ORG_REQUESTS_PER_HOUR = 40;

const bodySchema = z.object({
  prompt: z.string().min(3).max(4000),
  locale: z.string().optional(),
});

export const POST = withWorkspacesAuth(
  async (_req, { orgId }, data) => {
    try {
      if (!isGeminiConfigured()) {
        return jsonServiceUnavailable("מנוע AI לא מוגדר", "gemini_not_configured");
      }

      const orgRl = await checkRateLimit(`ai-builder:org:${orgId}`, ORG_REQUESTS_PER_HOUR, 60 * 60 * 1000);
      if (!orgRl.success) {
        return jsonTooManyRequests("חרגת ממכסת יצירת אפליקציות לשעה", "rate_limited", {
          resetAt: orgRl.resetAt,
        });
      }

      const locale = data.locale ?? (await getServerLocale());
      const prompt = data.prompt.trim();

      const sanitized = await generateUiSchemaFromPrompt(prompt, locale);
      if (!sanitized.ok) {
        log.warn("ui_schema_rejected", { error: sanitized.error, orgId });
        return jsonBadRequest("ה-AI החזיר סכמה לא תקינה. נסה לנסח מחדש.", "invalid_ui_schema");
      }

      return NextResponse.json({ uiSchema: sanitized.schema });
    } catch (err: unknown) {
      return apiErrorResponse(err, "api/ai-builder/generate");
    }
  },
  {
    schema: bodySchema,
    rateLimit: { key: "ai:app-builder", limit: 20, windowMs: 60_000 },
  },
);

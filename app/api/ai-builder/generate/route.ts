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
import { generateAppBuilderUiFromPrompt } from "@/lib/app-builder/generate-app-ui";
import type { AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = createLogger("ai-app-builder");

const ORG_REQUESTS_PER_HOUR = 40;

/**
 * `currentUiSchema` and `mode` moved here from the chat route.
 *
 * The chat route used to classify the intent *and* generate the UI in one
 * request — two sequential model calls. On Vercel that shares a single 60s
 * invocation budget, and a dashboard of any size blew through it:
 * FUNCTION_INVOCATION_TIMEOUT, measured at 60s against production. The user saw
 * their message sit in the transcript with no answer.
 *
 * Splitting the two means each model call gets its own budget, and the chat
 * reply arrives immediately instead of waiting for the build.
 */
const bodySchema = z.object({
  prompt: z.string().min(3).max(4000),
  locale: z.string().optional(),
  currentUiSchema: z.unknown().optional(),
  mode: z.enum(["build", "update"]).optional(),
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

      const generated = await generateAppBuilderUiFromPrompt({
        description: prompt,
        locale,
        currentUiSchema: (data.currentUiSchema ?? null) as AppBuilderUiSchema | null,
        orgId,
        mode: data.mode ?? (data.currentUiSchema ? "update" : "build"),
      });

      if (!generated.uiSchema && !generated.jsxCode) {
        log.warn("ui_schema_rejected", { error: generated.schemaError, orgId });
        return jsonBadRequest("ה-AI החזיר סכמה לא תקינה. נסה לנסח מחדש.", "invalid_ui_schema");
      }

      return NextResponse.json({
        uiSchema: generated.uiSchema,
        jsxCode: generated.jsxCode,
        schemaError: generated.schemaError,
      });
    } catch (err: unknown) {
      return apiErrorResponse(err, "api/ai-builder/generate");
    }
  },
  {
    schema: bodySchema,
    rateLimit: { key: "ai:app-builder", limit: 20, windowMs: 60_000 },
  },
);

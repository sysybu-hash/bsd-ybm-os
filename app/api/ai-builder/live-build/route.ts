import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { generateAppBuilderUiFromPrompt } from "@/lib/app-builder/generate-app-ui";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { jsonBadRequest, jsonServiceUnavailable, jsonTooManyRequests } from "@/lib/api-json";
import { getServerLocale } from "@/lib/i18n/server";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { appBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORG_REQUESTS_PER_HOUR = 60;

const bodySchema = z.object({
  description: z.string().min(3).max(8000),
  locale: z.string().optional(),
  currentUiSchema: appBuilderUiSchema.nullish(),
  mode: z.enum(["build", "update"]).optional(),
});

export const POST = withWorkspacesAuth(
  async (_req, { orgId }, data) => {
    try {
      if (!isGeminiConfigured()) {
        return jsonServiceUnavailable("מנוע AI לא מוגדר", "gemini_not_configured");
      }

      const orgRl = await checkRateLimit(
        `ai-builder-live-build:org:${orgId}`,
        ORG_REQUESTS_PER_HOUR,
        60 * 60 * 1000,
      );
      if (!orgRl.success) {
        return jsonTooManyRequests("חרגת ממכסת בניית UI קולית לשעה", "rate_limited", {
          resetAt: orgRl.resetAt,
        });
      }

      const locale = data.locale ?? (await getServerLocale());
      const mode = data.mode ?? (data.currentUiSchema != null ? "update" : "build");

      if (mode === "update" && data.currentUiSchema == null) {
        return jsonBadRequest("אין ממשק לעדכון", "nothing_to_update");
      }

      const result = await generateAppBuilderUiFromPrompt({
        description: data.description,
        locale,
        currentUiSchema: data.currentUiSchema,
        orgId,
        mode,
      });

      const hasOutput = result.uiSchema != null || Boolean(result.jsxCode?.trim());
      if (!hasOutput) {
        return jsonBadRequest("לא נוצר ממשק", "generation_failed");
      }

      return NextResponse.json({
        reply:
          mode === "update"
            ? "הממשק עודכן בתצוגה המקדימה"
            : "הממשק נבנה בתצוגה המקדימה",
        uiSchema: result.uiSchema,
        jsxCode: result.jsxCode,
        schemaError: result.schemaError,
      });
    } catch (err: unknown) {
      return apiErrorResponse(err, "api/ai-builder/live-build");
    }
  },
  {
    schema: bodySchema,
    rateLimit: { key: "ai:app-builder-live-build", limit: 20, windowMs: 60_000 },
  },
);

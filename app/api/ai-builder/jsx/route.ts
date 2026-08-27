import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonServiceUnavailable, jsonTooManyRequests } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { generateAppBuilderJsx } from "@/lib/app-builder/generate-app-ui";
import { createLogger } from "@/lib/logger";

const log = createLogger("ai-app-builder-jsx");

const ORG_REQUESTS_PER_HOUR = 40;

/**
 * The JSX half of a build, on its own invocation.
 *
 * The schema and the JSX used to be generated together. Even running in
 * parallel they share one 60s Vercel budget, and the JSX call — up to 16k output
 * tokens of a full dashboard — is the long pole: measured timing out at 61s
 * against production, which left the user with nothing at all.
 *
 * Split, the schema comes back quickly and the user sees a working dashboard
 * rendered by DynamicRenderer. This route then upgrades that to a live React
 * preview if it succeeds. It is an enhancement, so a failure here is not an
 * error the user needs to see.
 */
const bodySchema = z.object({
  prompt: z.string().min(3).max(4000),
});

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withWorkspacesAuth(
  async (_req, { orgId }, data) => {
    try {
      if (!isGeminiConfigured()) {
        return jsonServiceUnavailable("מנוע AI לא מוגדר", "gemini_not_configured");
      }

      const orgRl = await checkRateLimit(
        `ai-builder-jsx:org:${orgId}`,
        ORG_REQUESTS_PER_HOUR,
        60 * 60 * 1000,
      );
      if (!orgRl.success) {
        return jsonTooManyRequests("חרגת ממכסת יצירת אפליקציות לשעה", "rate_limited", {
          resetAt: orgRl.resetAt,
        });
      }

      const jsxCode = await generateAppBuilderJsx(data.prompt.trim(), orgId);
      log.info("jsx_route", { orgId, ok: Boolean(jsxCode) });

      // No jsxCode is a normal outcome, not a failure: the caller already has a
      // rendered schema and simply does not get the upgrade.
      return NextResponse.json({ jsxCode: jsxCode ?? null });
    } catch (err: unknown) {
      return apiErrorResponse(err, "api/ai-builder/jsx");
    }
  },
  {
    schema: bodySchema,
    rateLimit: { key: "ai:app-builder-jsx", limit: 20, windowMs: 60_000 },
  },
);

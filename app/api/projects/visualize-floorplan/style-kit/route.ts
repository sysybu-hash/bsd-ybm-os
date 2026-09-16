import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonTooManyRequests } from "@/lib/api-json";
import { assertProviderConfigured } from "@/lib/ai-providers";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { synthesizeFloorplanStyleKit } from "@/lib/projects/floorplan-viz-style-from-prompt";
import type { CustomStyleAnswers, FloorplanVizAudience } from "@/lib/projects/floorplan-viz-styles";
import { israelClockTime } from "@/lib/projects/floorplan-viz-rate-limit";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MOODS = new Set(["light", "dark", "luxury", "developer"]);

export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  try {
    const rl = await checkRateLimit(`floorplan-style-kit:org:${orgId}:user:${userId}`, 30, 60 * 60 * 1000);
    if (!rl.success) {
      return jsonTooManyRequests(
        `הגבלת קצב לבניית סל עיצוב. נסו שוב אחרי ${israelClockTime(rl.resetAt)}.`,
        "rate_limited",
        { resetAt: rl.resetAt },
      );
    }

    const geminiErr = assertProviderConfigured("gemini");
    if (geminiErr) return jsonBadRequest(geminiErr, "gemini_not_configured");

    const industryBlock = await guardConstructionOnlyApi(orgId);
    if (industryBlock) return industryBlock;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const moodRaw = String(body.mood ?? "").trim();
    const answers: CustomStyleAnswers = {
      freeText: String(body.freeText ?? "").slice(0, 800),
      audience: body.audience === "haredi" ? "haredi" : ("general" as FloorplanVizAudience),
      mood: MOODS.has(moodRaw) ? (moodRaw as NonNullable<CustomStyleAnswers["mood"]>) : undefined,
      dominantColor: String(body.dominantColor ?? "").slice(0, 16),
      mustHave: String(body.mustHave ?? "").slice(0, 400),
      mustNot: String(body.mustNot ?? "").slice(0, 400),
    };

    const kit = await synthesizeFloorplanStyleKit(answers);
    return NextResponse.json({ success: true, kit });
  } catch (error) {
    return apiErrorResponse(error, "visualize-floorplan-style-kit");
  }
});

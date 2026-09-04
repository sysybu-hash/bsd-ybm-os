import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonNotFound, jsonTooManyRequests } from "@/lib/api-json";
import { assertProviderConfigured } from "@/lib/ai-providers";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { enforceFloorplanVizRateLimit } from "@/lib/projects/floorplan-viz-rate-limit";
import { editFloorplanStill, sanitizeFloorplanVizEditInstruction } from "@/lib/projects/floorplan-viz-generate";
import {
  deleteFloorplanVizStill,
  getFloorplanVizStillForOrg,
  parseFloorplanVizViewId,
  updateFloorplanVizStillImage,
} from "@/lib/projects/floorplan-viz-store";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import { resolveFloorplanVizStyle } from "@/lib/projects/floorplan-viz-styles";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const editSchema = z.object({
  instruction: z.string().min(1).max(2000),
});

export const PATCH = withWorkspacesAuthDynamic<
  { id: string; stillId: string },
  typeof editSchema
>(
  async (_req, { orgId, userId }, segment, body) => {
    try {
      const industryBlock = await guardConstructionOnlyApi(orgId);
      if (industryBlock) return industryBlock;
      const geminiErr = assertProviderConfigured("gemini");
      if (geminiErr) return jsonBadRequest(geminiErr, "gemini_not_configured");

      const quota = await enforceFloorplanVizRateLimit(orgId, userId);
      if (!quota.ok) {
        return jsonTooManyRequests(quota.message, "rate_limited", { resetAt: quota.resetAt });
      }

      const { id, stillId } = await segment.params;
      const instruction = sanitizeFloorplanVizEditInstruction(body.instruction);
      if (!instruction) return jsonBadRequest("חסרה בקשת עריכה", "missing_edit");

      const still = await getFloorplanVizStillForOrg(orgId, id, stillId);
      if (!still) return jsonNotFound("התמונה לא נמצאה", "viz_still_not_found");

      const layout = parseFloorplanLayout(still.run.layoutJson as Record<string, unknown>);
      const styleRaw =
        still.run.styleKitJson && typeof still.run.styleKitJson === "object"
          ? (still.run.styleKitJson as Record<string, unknown>)
          : {};
      const edited = await editFloorplanStill({
        layout,
        still: {
          id: still.id,
          viewId: parseFloorplanVizViewId(still.viewId),
          labelHe: still.labelHe,
          roomName: still.roomName ?? undefined,
          mimeType: still.mimeType,
          base64: still.dataBase64,
        },
        plan: { base64: still.run.planBase64, mimeType: still.run.planMimeType },
        instruction,
        styleKit: resolveFloorplanVizStyle(
          typeof styleRaw.id === "string" ? styleRaw.id : undefined,
          styleRaw,
        ),
        photo: still.run.photo,
      });
      const image = await updateFloorplanVizStillImage(orgId, id, stillId, {
        mimeType: edited.mimeType,
        base64: edited.base64,
        editPrompt: instruction,
      });
      if (!image) return jsonNotFound("התמונה לא נמצאה", "viz_still_not_found");
      return NextResponse.json({ success: true, image });
    } catch (error) {
      return apiErrorResponse(error, "visualize-floorplan still PATCH");
    }
  },
  { schema: editSchema },
);

export const DELETE = withWorkspacesAuthDynamic<{ id: string; stillId: string }>(
  async (_req, { orgId }, segment) => {
    try {
      const industryBlock = await guardConstructionOnlyApi(orgId);
      if (industryBlock) return industryBlock;
      const { id, stillId } = await segment.params;
      const ok = await deleteFloorplanVizStill(orgId, id, stillId);
      if (!ok) return jsonNotFound("התמונה לא נמצאה", "viz_still_not_found");
      return NextResponse.json({ success: true });
    } catch (error) {
      return apiErrorResponse(error, "visualize-floorplan still DELETE");
    }
  },
);

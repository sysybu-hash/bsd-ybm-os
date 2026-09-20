import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonNotFound, jsonTooManyRequests } from "@/lib/api-json";
import { assertProviderConfigured } from "@/lib/ai-providers";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { enforceFloorplanVizRateLimit } from "@/lib/projects/floorplan-viz-rate-limit";
import {
  editFloorplanStill,
  improveFloorplanStill,
  rescanFloorplanStillIssues,
  sanitizeFloorplanVizEditInstruction,
} from "@/lib/projects/floorplan-viz-generate";
import {
  clampFloorplanVizEditRegion,
  formatFloorplanVizEditPrompt,
} from "@/lib/projects/floorplan-viz-edit-region";
import {
  appendFloorplanVizStillEdit,
  deleteFloorplanVizStill,
  getFloorplanVizStillForOrg,
  parseFloorplanVizViewId,
  selectFloorplanVizStill,
  updateFloorplanVizStillAuditIssues,
} from "@/lib/projects/floorplan-viz-store";
import { unpackFloorplanVizStillMeta } from "@/lib/projects/floorplan-viz-ids";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import { resolveFloorplanVizStyle } from "@/lib/projects/floorplan-viz-styles";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const patchSchema = z
  .object({
    instruction: z.string().min(1).max(8000).optional(),
    improve: z.literal(true).optional(),
    rescan: z.literal(true).optional(),
    selected: z.literal(true).optional(),
    /** English audit failure lines the user checked — improve only these. */
    failures: z.array(z.string().min(1).max(400)).max(20).optional(),
    region: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        w: z.number().finite(),
        h: z.number().finite(),
      })
      .optional(),
  })
  .refine(
    (body) =>
      Boolean(body.instruction) ||
      body.selected === true ||
      body.improve === true ||
      body.rescan === true,
    { message: "חסרה בקשת עריכה" },
  );

export const PATCH = withWorkspacesAuthDynamic<
  { id: string; stillId: string },
  typeof patchSchema
>(
  async (_req, { orgId, userId, role }, segment, body) => {
    try {
      const industryBlock = await guardConstructionOnlyApi(orgId, role);
      if (industryBlock) return industryBlock;

      const { id, stillId } = await segment.params;

      if (body.selected === true && !body.instruction && body.improve !== true && body.rescan !== true) {
        const run = await selectFloorplanVizStill(orgId, id, stillId);
        if (!run) return jsonNotFound("התמונה לא נמצאה", "viz_still_not_found");
        const image = run.images.find((row) => row.id === stillId);
        if (!image) return jsonNotFound("התמונה לא נמצאה", "viz_still_not_found");
        return NextResponse.json({ success: true, image, images: run.images });
      }

      const geminiErr = assertProviderConfigured("gemini");
      if (geminiErr) return jsonBadRequest(geminiErr, "gemini_not_configured");

      const quota = await enforceFloorplanVizRateLimit(orgId, userId);
      if (!quota.ok) {
        return jsonTooManyRequests(quota.message, "rate_limited", { resetAt: quota.resetAt });
      }

      const still = await getFloorplanVizStillForOrg(orgId, id, stillId);
      if (!still) return jsonNotFound("התמונה לא נמצאה", "viz_still_not_found");

      const layout = parseFloorplanLayout(still.run.layoutJson as Record<string, unknown>);
      const styleRaw =
        still.run.styleKitJson && typeof still.run.styleKitJson === "object"
          ? (still.run.styleKitJson as Record<string, unknown>)
          : {};
      const styleKit = resolveFloorplanVizStyle(
        typeof styleRaw.id === "string" ? styleRaw.id : undefined,
        styleRaw,
      );
      const stillImage = {
        id: still.id,
        viewId: parseFloorplanVizViewId(still.viewId),
        labelHe: still.labelHe,
        roomName: still.roomName ?? undefined,
        mimeType: still.mimeType,
        base64: still.dataBase64,
        auditIssues: unpackFloorplanVizStillMeta(still.editPrompt).auditIssues,
      };
      const plan = { base64: still.run.planBase64, mimeType: still.run.planMimeType };

      if (body.rescan === true) {
        const auditIssues = await rescanFloorplanStillIssues({
          layout,
          still: stillImage,
          plan,
          haredi: styleKit.audience === "haredi",
        });
        const run = await updateFloorplanVizStillAuditIssues(orgId, id, stillId, auditIssues);
        if (!run) return jsonNotFound("התמונה לא נמצאה", "viz_still_not_found");
        const image = run.images.find((row) => row.id === stillId);
        if (!image) return jsonNotFound("התמונה לא נמצאה", "viz_still_not_found");
        return NextResponse.json({ success: true, image, images: run.images, auditIssues });
      }

      if (body.improve === true) {
        const selected = (body.failures ?? []).map((f) => f.trim()).filter(Boolean);
        const improved = await improveFloorplanStill({
          layout,
          still: stillImage,
          plan,
          styleKit,
          photo: still.run.photo,
          failures: selected.length ? selected : stillImage.auditIssues,
          selectedOnly: selected.length > 0,
        });
        const run = await appendFloorplanVizStillEdit(orgId, id, stillId, {
          mimeType: improved.mimeType,
          base64: improved.base64,
          editPrompt: "שפר תמונה",
          auditIssues: improved.auditIssues,
        });
        if (!run) return jsonNotFound("התמונה לא נמצאה", "viz_still_not_found");
        const image = run.images.find(
          (row) =>
            row.selected &&
            row.viewId === parseFloorplanVizViewId(still.viewId) &&
            (row.roomName ?? "") === (still.roomName ?? ""),
        );
        if (!image) return jsonNotFound("התמונה לא נמצאה", "viz_still_not_found");
        return NextResponse.json({ success: true, image, images: run.images });
      }

      const instruction = sanitizeFloorplanVizEditInstruction(body.instruction ?? "");
      if (!instruction) return jsonBadRequest("חסרה בקשת עריכה", "missing_edit");
      const region = clampFloorplanVizEditRegion(body.region);

      const edited = await editFloorplanStill({
        layout,
        still: stillImage,
        plan,
        instruction,
        styleKit,
        photo: still.run.photo,
        region,
      });
      // The model redrew the flat instead of editing it. Saving that would
      // replace a frame the user already approved with a different apartment,
      // so nothing is written and the reason goes back as the toast.
      if (edited.rejected) {
        return jsonBadRequest(edited.rejected, "viz_edit_redrew_frame");
      }
      const run = await appendFloorplanVizStillEdit(orgId, id, stillId, {
        mimeType: edited.mimeType,
        base64: edited.base64,
        editPrompt: formatFloorplanVizEditPrompt(instruction, region),
      });
      if (!run) return jsonNotFound("התמונה לא נמצאה", "viz_still_not_found");
      const image = run.images.find(
        (row) =>
          row.selected &&
          row.viewId === parseFloorplanVizViewId(still.viewId) &&
          (row.roomName ?? "") === (still.roomName ?? ""),
      );
      if (!image) return jsonNotFound("התמונה לא נמצאה", "viz_still_not_found");
      return NextResponse.json({ success: true, image, images: run.images });
    } catch (error) {
      return apiErrorResponse(error, "visualize-floorplan still PATCH");
    }
  },
  { schema: patchSchema },
);

export const DELETE = withWorkspacesAuthDynamic<{ id: string; stillId: string }>(
  async (_req, { orgId, role }, segment) => {
    try {
      const industryBlock = await guardConstructionOnlyApi(orgId, role);
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

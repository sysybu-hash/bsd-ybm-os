import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonNotFound, jsonTooManyRequests } from "@/lib/api-json";
import { assertProviderConfigured } from "@/lib/ai-providers";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { visualizeFloorplanFromDrawing, parseFloorplanVizScope } from "@/lib/projects/floorplan-viz";
import { titleFromFloorplanLayout } from "@/lib/projects/floorplan-viz-ids";
import { floorplanExtractFingerprint, floorplanVizInputFingerprint } from "@/lib/projects/floorplan-viz-lock";
import { resolveFloorplanVizStyle } from "@/lib/projects/floorplan-viz-styles";
import {
  appendFloorplanVizStills,
  createFloorplanVizRun,
  findFloorplanLayoutByExtractFingerprint,
  findFloorplanVizRunByInputFingerprint,
  getFloorplanVizRunForOrg,
  listFloorplanVizRunsForOrg,
  type FloorplanVizRunDetail,
} from "@/lib/projects/floorplan-viz-store";
import { inferMimeFromFileName } from "@/lib/scan-mime";
import { enforceFloorplanVizRateLimit } from "@/lib/projects/floorplan-viz-rate-limit";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel caps a serverless function's request body at 4.5MB, so a 15MB promise
 * was never keepable — the platform rejects the upload before this route runs.
 * 4MB leaves room for the multipart envelope, and matches what apiErrors
 * .file_too_large has been telling users all along.
 */
const MAX_BYTES = 4 * 1024 * 1024;
/** Multipart boundaries and field headers ride along with the file bytes. */
const MULTIPART_OVERHEAD = 64 * 1024;
const log = createLogger("visualize-floorplan");

function clientPayload(run: FloorplanVizRunDetail, includePlan: boolean) {
  return {
    success: true as const,
    runId: run.id,
    title: run.title,
    layout: run.layout,
    images: run.images,
    enginesUsed: run.enginesUsed,
    ocrEngines: run.ocrEngines,
    visionEngines: run.visionEngines,
    grounding: {
      dimensionStrings: run.layout.dimensionStrings,
      roomNameHits: run.layout.rooms.map((room) => room.name),
    },
    styleKit: run.styleKit,
    scope: run.scope,
    ...(includePlan ? { planBase64: run.planBase64, planMimeType: run.planMimeType } : {}),
  };
}

export const GET = withWorkspacesAuth(
  async (req, { orgId }) => {
    const industryBlock = await guardConstructionOnlyApi(orgId);
    if (industryBlock) return industryBlock;
    const projectId = new URL(req.url).searchParams.get("projectId")?.trim() || undefined;
    const runs = await listFloorplanVizRunsForOrg(orgId, projectId);
    return NextResponse.json({ runs });
  },
  { parseTarget: "query" },
);

export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  try {
    const geminiErr = assertProviderConfigured("gemini");
    if (geminiErr) return jsonBadRequest(geminiErr, "gemini_not_configured");

    // Reject on the declared length before buffering. The file.size check below
    // never sees a genuinely oversized upload: req.formData() throws while
    // reading the body, and the caller gets a 500 instead of file_too_large.
    const declaredLength = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES + MULTIPART_OVERHEAD) {
      return jsonBadRequest("הקובץ גדול מדי (מקסימום 4MB)", "file_too_large");
    }

    const formData = await req.formData();
    const runId = String(formData.get("runId") ?? "").trim();
    const projectId = String(formData.get("projectId") ?? "").trim();

    const industryBlock = await guardConstructionOnlyApi(orgId);
    if (industryBlock) return industryBlock;

    if (projectId) {
      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;
    }

    if (runId) {
      const quota = await enforceFloorplanVizRateLimit(orgId, userId);
      if (!quota.ok) {
        return jsonTooManyRequests(quota.message, "rate_limited", { resetAt: quota.resetAt });
      }
      const existing = await getFloorplanVizRunForOrg(orgId, runId);
      if (!existing) return jsonNotFound("ההדמיה לא נמצאה", "viz_run_not_found");
      const scope = parseFloorplanVizScope(String(formData.get("scope") ?? "rooms"));
      const result = await visualizeFloorplanFromDrawing(existing.planBase64, existing.planMimeType, {
        customKit: existing.styleKit,
        planKind: existing.photo ? "photo" : "sales-sheet",
        scope,
        existingLayout: existing.layout,
        existingImages: existing.images,
      });
      const saved = await appendFloorplanVizStills(
        orgId,
        existing.id,
        result.images,
        scope === "rooms" ? "full" : scope,
      );
      if (!saved) return jsonNotFound("ההדמיה לא נמצאה", "viz_run_not_found");
      return NextResponse.json(clientPayload(saved, false));
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonBadRequest("חסר קובץ תוכנית", "missing_fields");
    }
    if (file.size > MAX_BYTES) {
      return jsonBadRequest("הקובץ גדול מדי (מקסימום 4MB)", "file_too_large");
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = inferMimeFromFileName(file.name, file.type);

    const styleId = String(formData.get("styleId") ?? "").trim();
    const planKindRaw = String(formData.get("planKind") ?? "auto").trim();
    const planKind =
      planKindRaw === "sales-sheet" || planKindRaw === "photo" ? planKindRaw : "auto";
    const scope = parseFloorplanVizScope(String(formData.get("scope") ?? "full"));
    let customKit: unknown;
    const kitRaw = String(formData.get("styleKit") ?? "").trim();
    if (kitRaw) {
      try {
        customKit = JSON.parse(kitRaw) as unknown;
      } catch {
        customKit = undefined;
      }
    }
    let existingLayout: unknown;
    const layoutRaw = String(formData.get("layout") ?? "").trim();
    if (layoutRaw) {
      try {
        existingLayout = JSON.parse(layoutRaw) as unknown;
      } catch {
        existingLayout = undefined;
      }
    }
    let existingImages: Array<{ viewId: string; roomName?: string }> | undefined;
    const imagesRaw = String(formData.get("existingImages") ?? "").trim();
    if (imagesRaw) {
      try {
        const parsed = JSON.parse(imagesRaw) as unknown;
        if (Array.isArray(parsed)) {
          existingImages = parsed.map((row) => {
            const r = row as Record<string, unknown>;
            return {
              viewId: String(r.viewId ?? ""),
              roomName: typeof r.roomName === "string" ? r.roomName : undefined,
            };
          });
        }
      } catch {
        existingImages = undefined;
      }
    }

    if (scope === "rooms" && !existingLayout) {
      return jsonBadRequest("חסר פענוח קודם להשלמת החללים", "missing_layout");
    }

    const forceNew = ["1", "true", "yes"].includes(
      String(formData.get("forceNew") ?? "").trim().toLowerCase(),
    );
    const styleKit = resolveFloorplanVizStyle(styleId, customKit);
    const extractFp = floorplanExtractFingerprint({
      planBase64: base64,
      mimeType,
      planKind,
    });
    const inputFp = floorplanVizInputFingerprint({
      planBase64: base64,
      mimeType,
      planKind,
      scope,
      styleKit,
    });

    if (!forceNew) {
      const cachedRun = await findFloorplanVizRunByInputFingerprint(orgId, inputFp);
      if (cachedRun) {
        return NextResponse.json(clientPayload(cachedRun, false));
      }
    }

    const quota = await enforceFloorplanVizRateLimit(orgId, userId);
    if (!quota.ok) {
      return jsonTooManyRequests(quota.message, "rate_limited", { resetAt: quota.resetAt });
    }

    const cachedLayout =
      !forceNew && existingLayout == null
        ? await findFloorplanLayoutByExtractFingerprint(orgId, extractFp)
        : null;

    const result = await visualizeFloorplanFromDrawing(base64, mimeType, {
      styleId,
      customKit,
      planKind,
      scope,
      existingLayout: scope === "rooms" ? existingLayout : existingLayout ?? cachedLayout ?? undefined,
      existingImages: scope === "rooms" ? existingImages : undefined,
    });

    try {
      const saved = await createFloorplanVizRun({
        orgId,
        userId,
        projectId: projectId || null,
        title: titleFromFloorplanLayout(result.layout, file.name.replace(/\.[^.]+$/u, "")),
        sourceFileName: file.name,
        planMimeType: result.planMimeType,
        planBase64: result.planBase64,
        layout: result.layout,
        styleKit: result.styleKit,
        scope: result.scope,
        photo: result.photo,
        extractFingerprint: extractFp,
        inputFingerprint: inputFp,
        enginesUsed: result.enginesUsed,
        ocrEngines: result.ocrEngines,
        visionEngines: result.visionEngines,
        images: result.images,
      });
      return NextResponse.json(clientPayload(saved, false));
    } catch (persistErr) {
      log.warn("persist viz run failed", {
        error: persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
      return NextResponse.json({
        success: true,
        ...result,
        planBase64: undefined,
        planMimeType: undefined,
      });
    }
  } catch (error) {
    return apiErrorResponse(error, "visualize-floorplan");
  }
});

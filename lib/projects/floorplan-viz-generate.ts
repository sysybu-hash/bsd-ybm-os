import { buildLabelledPlanJpeg, layoutCanGuide } from "@/lib/projects/floorplan-plan-guide";
import { createLogger } from "@/lib/logger";
import {
  layoutForVisualization,
  type FloorplanLayout,
  type FloorplanVizImage,
} from "@/lib/projects/floorplan-layout";
import { overlayPrintedProgram, type PrintedUnitTruth } from "@/lib/projects/floorplan-booklet-rooms";
import { stampFieldsFromLayout, stampFloorplanStill } from "@/lib/projects/floorplan-viz-stamp";
import { type FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";
import {
  listFloorplanVizJobs,
  type FloorplanVizScope,
} from "@/lib/projects/floorplan-viz-scope";
import { collectShipIssues } from "@/lib/projects/viz-generate/audit-gate";
import {
  IMAGE_CONCURRENCY,
  attachmentsForJob,
  planImageForGeneration,
  runPool,
  type VizJob,
} from "@/lib/projects/viz-generate/jobs";
import { aspectRatioForPlan, buildVizPrompt } from "@/lib/projects/viz-generate/prompts";
import {
  buildWallHint,
  generateAuditedImage,
  warmLook,
} from "@/lib/projects/viz-generate/attempts";

export type { FloorplanVizScope };
export { listFloorplanVizJobs, parseFloorplanVizScope } from "@/lib/projects/floorplan-viz-scope";

export { hebrewFloorplanAuditIssue, rescanFloorplanStillIssues } from "@/lib/projects/viz-generate/audit-gate";
export {
  CAD_MASSING_LOCK,
  ENTRANCE_LOCK,
  GEOMETRY_LOCK,
  SALES_BROCHURE_BRIEF,
  buildVizPrompt,
  type WallHintKind,
} from "@/lib/projects/viz-generate/prompts";
export {
  FLOORPLAN_VIZ_EDIT_INSTRUCTION_MAX,
  buildFloorplanImproveInstruction,
  buildStillEditPrompt,
  editFloorplanStill,
  improveFloorplanStill,
  sanitizeFloorplanVizEditInstruction,
} from "@/lib/projects/viz-generate/edit";
export { floorplanOverviewAttachments } from "@/lib/projects/viz-generate/jobs";

const log = createLogger("floorplan-viz-generate");

export async function generateFloorplanVisuals(
  layout: FloorplanLayout,
  base64: string,
  mimeType: string,
  options?: {
    photo?: boolean;
    styleKit?: FloorplanVizStyleKit;
    scope?: FloorplanVizScope;
    existingImages?: Array<{ viewId: string; roomName?: string }>;
    /** What the run is called, for the caption when the sheet prints no unit. */
    unitTitle?: string;
    /** CAD / prior overview so isometric traces a still that already exists. */
    seedOverview?: { mimeType: string; base64: string };
    /** CAD 3D massing of this unit — attached after the sales sheet, never as the plan. */
    geometryLock?: { mimeType: string; base64: string };
    /** Sales booklet: overview + isometric only. Interiors invent rooms. */
    skipInteriors?: boolean;
    /** The program printed on the sheet, so the prompt names every terrace and bath. */
    truth?: PrintedUnitTruth;
    /**
     * Epoch ms the run must be finished by. The route has 300 seconds and a
     * timeout returns nothing at all — not even the frames already paid for.
     */
    deadlineMs?: number;
    /**
     * A schematic of this flat, drawn from where the extractor placed its
     * rooms. Used when the measured CAD route cannot read the sheet's walls.
     */
    schematicPlate?: { mimeType: string; base64: string };
  },
): Promise<FloorplanVizImage[]> {
  const vizLayout = overlayPrintedProgram(layoutForVisualization(layout), options?.truth);
  const specs = listFloorplanVizJobs(vizLayout, options?.scope ?? "full", options?.existingImages, {
    skipInteriors: options?.skipInteriors,
  });
  if (specs.length === 0) {
    throw new Error("אין הדמיות נוספות לייצר");
  }
  // A sheet whose room labels the extractor placed gets them written back
  // onto it: the model is told where each room goes, in the picture itself.
  const guide =
    options?.geometryLock?.base64 || !layoutCanGuide(vizLayout)
      ? null
      : await buildLabelledPlanJpeg({ base64, mimeType }, vizLayout);
  // Both the image model and the auditor get a picture of the sheet. The
  // auditor is the one that reports "mirrored vs plan", and it was comparing
  // a photograph against a PDF.
  const planPicture = await planImageForGeneration({ base64, mimeType });
  const hint = await buildWallHint(base64, mimeType, options?.photo === true);
  const ink = hint?.image ?? null;
  const massing = null;
  const aspectRatio = await aspectRatioForPlan(base64, mimeType);
  const overviewOpts = {
    ...options,
    inkWall: Boolean(ink),
    massingMap: Boolean(massing),
    geometryLock: Boolean(options?.geometryLock?.base64),
    hintKind: hint?.kind,
    planGuide: Boolean(guide),
    schematicPlate: Boolean(options?.schematicPlate?.base64),
  };
  const jobs: VizJob[] = specs.map((spec) => ({
    ...spec,
    prompt:
      spec.viewId === "interior"
        ? buildVizPrompt(
            vizLayout,
            { kind: "interior", roomName: spec.roomName },
            {
              photo: options?.photo,
              styleKit: options?.styleKit,
              geometryLock: Boolean(options?.geometryLock?.base64),
            },
          )
        : buildVizPrompt(vizLayout, { kind: spec.viewId }, overviewOpts),
  }));

  const runJob = async (
    job: VizJob,
    overviewStill?: { mimeType: string; base64: string } | null,
  ): Promise<FloorplanVizImage | null> => {
    try {
      const attachments = await attachmentsForJob(
        job,
        planPicture,
        ink,
        massing,
        vizLayout,
        overviewStill,
        options?.geometryLock,
        guide,
        options?.schematicPlate,
      );
      const audited = await generateAuditedImage(job, attachments, aspectRatio, {
        layout: vizLayout,
        plan: planPicture,
        haredi: options?.styleKit?.audience === "haredi",
        deadlineMs: options?.deadlineMs,
      });
      const haredi = options?.styleKit?.audience === "haredi";
      const auditCtx = {
        layout: vizLayout,
        plan: planPicture,
        haredi: haredi === true,
        deadlineMs: options?.deadlineMs,
      };
      let img: { mimeType: string; base64: string; auditIssues?: string[] } = audited;
      if (job.viewId === "overview" || job.viewId === "isometric") {
        const warmed = await warmLook(audited, job, attachments, aspectRatio, auditCtx);
        if (warmed.base64 !== audited.base64) {
          const warmIssues = await collectShipIssues(warmed, auditCtx, job.labelHe);
          img = { ...warmed, auditIssues: warmIssues.length ? warmIssues : audited.auditIssues };
        } else {
          img = { ...warmed, auditIssues: audited.auditIssues };
        }
      }
      // Stamped after the audit, never before: the auditor fails a still that
      // has letters in it, and this caption is letters on purpose.
      const stamped = await stampFloorplanStill(
        img,
        stampFieldsFromLayout(layout, options?.unitTitle),
      );
      return {
        viewId: job.viewId,
        labelHe: job.labelHe,
        roomName: job.roomName,
        mimeType: stamped.mimeType,
        base64: stamped.base64,
        auditIssues: img.auditIssues,
      } satisfies FloorplanVizImage;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("view generation skipped", {
        view: job.labelHe,
        error: message,
      });
      return null;
    }
  };

  const overviewJobs = jobs.filter((j) => j.viewId === "overview");
  const restJobs = jobs.filter((j) => j.viewId !== "overview");
  const overviewOut = await runPool(overviewJobs, 1, (job) => runJob(job));
  const overviewStill = overviewOut[0] ?? options?.seedOverview ?? null;
  const restOut = await runPool(restJobs, IMAGE_CONCURRENCY, (job) => runJob(job, overviewStill));
  const out = [...overviewOut, ...restOut];

  if (out.length === 0) {
    throw new Error("יצירת ההדמיות נכשלה — לא התקבלה אף תמונה");
  }
  return out;
}


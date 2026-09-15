import { prisma } from "@/lib/prisma";
import {
  parseFloorplanLayout,
  type FloorplanLayout,
  type FloorplanVizImage,
} from "@/lib/projects/floorplan-layout";
import { resolveFloorplanVizStyle, type FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";
import { parseFloorplanVizScope, type FloorplanVizScope } from "@/lib/projects/floorplan-viz-scope";
import type { FloorplanSpend } from "@/lib/projects/floorplan-spend";
import {
  floorplanVizStillFilePath,
  floorplanVizViewKey,
  packFloorplanVizStillMeta,
  parseFloorplanVizOrigin,
  parseFloorplanVizViewId,
  stillSortOrder,
  unpackFloorplanVizStillMeta,
  type FloorplanVizRunSummary,
} from "@/lib/projects/floorplan-viz-ids";
import { type ConfidenceReport, type ConfidenceTier } from "@/lib/projects/floorplan-confidence";

export {
  floorplanVizStillFilePath,
  floorplanVizViewKey,
  parseFloorplanVizViewId,
};
export type { FloorplanVizRunSummary };

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is string => typeof row === "string");
}

function parseStoredConfidence(raw: unknown): ConfidenceReport | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  const tier = row.tier === "raster" || row.tier === "cad" ? (row.tier as ConfidenceTier) : null;
  if (!tier) return undefined;
  return {
    tier,
    hard: asStringArray(row.hard),
    soft: asStringArray(row.soft),
    ok: row.ok === true,
  };
}

type EnginesJson = {
  enginesUsed?: string[];
  ocrEngines?: string[];
  visionEngines?: string[];
  confidence?: ConfidenceReport;
  /** What the run cost in model calls. Stored with the engines, not in a column. */
  spend?: FloorplanSpend;
};

export type FloorplanVizRunDetail = {
  id: string;
  title: string;
  projectId: string | null;
  sourceFileName: string | null;
  planMimeType: string;
  planBase64: string;
  layout: FloorplanLayout;
  styleKit: FloorplanVizStyleKit;
  scope: FloorplanVizScope;
  photo: boolean;
  enginesUsed: string[];
  ocrEngines: string[];
  visionEngines: string[];
  confidence?: ConfidenceReport;
  spend?: FloorplanSpend;
  images: FloorplanVizImage[];
  createdAt: string;
  updatedAt: string;
};

function stillToImage(runId: string, still: {
  id: string;
  viewId: string;
  labelHe: string;
  roomName: string | null;
  mimeType: string;
  dataBase64: string;
  selected?: boolean;
  parentStillId?: string | null;
  origin?: string | null;
  attemptIndex?: number;
  createdAt?: Date;
  editPrompt?: string | null;
}): FloorplanVizImage {
  const meta = unpackFloorplanVizStillMeta(still.editPrompt);
  return {
    id: still.id,
    viewId: parseFloorplanVizViewId(still.viewId),
    labelHe: still.labelHe,
    roomName: still.roomName ?? undefined,
    mimeType: still.mimeType,
    base64: still.dataBase64,
    src: floorplanVizStillFilePath(runId, still.id),
    selected: still.selected !== false,
    parentStillId: still.parentStillId ?? undefined,
    origin: parseFloorplanVizOrigin(still.origin),
    attemptIndex: still.attemptIndex,
    createdAt: still.createdAt?.toISOString(),
    editPrompt: meta.editPrompt,
    auditIssues: meta.auditIssues,
  };
}

function stillOriginOf(img: FloorplanVizImage): string {
  if (img.origin) return img.origin;
  return img.roomName === "גיאומטריה" ? "cad" : "generate";
}

export async function listFloorplanVizRunsForOrg(
  orgId: string,
  projectId?: string,
): Promise<FloorplanVizRunSummary[]> {
  const rows = await prisma.floorplanVizRun.findMany({
    where: {
      organizationId: orgId,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: {
      id: true,
      title: true,
      projectId: true,
      styleLabelHe: true,
      scope: true,
      createdAt: true,
      updatedAt: true,
      project: { select: { name: true } },
      stills: {
        where: { selected: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        select: { id: true },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    styleLabelHe: row.styleLabelHe,
    scope: parseFloorplanVizScope(row.scope),
    stillCount: row.stills.length,
    thumbStillId: row.stills[0]?.id ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getFloorplanVizRunForOrg(
  orgId: string,
  runId: string,
): Promise<FloorplanVizRunDetail | null> {
  const row = await prisma.floorplanVizRun.findFirst({
    where: { id: runId, organizationId: orgId },
    include: {
      stills: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!row) return null;
  const engines = (row.enginesJson ?? {}) as EnginesJson;
  const styleRaw = row.styleKitJson && typeof row.styleKitJson === "object"
    ? (row.styleKitJson as Record<string, unknown>)
    : {};
  return {
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    sourceFileName: row.sourceFileName,
    planMimeType: row.planMimeType,
    planBase64: row.planBase64,
    layout: parseFloorplanLayout(row.layoutJson as Record<string, unknown>),
    styleKit: resolveFloorplanVizStyle(
      typeof styleRaw.id === "string" ? styleRaw.id : undefined,
      styleRaw,
    ),
    scope: parseFloorplanVizScope(row.scope),
    photo: row.photo,
    enginesUsed: asStringArray(engines.enginesUsed),
    ocrEngines: asStringArray(engines.ocrEngines),
    visionEngines: asStringArray(engines.visionEngines),
    confidence: parseStoredConfidence(engines.confidence),
    spend: engines.spend,
    images: row.stills.map((still) => stillToImage(row.id, still)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findFloorplanVizRunByInputFingerprint(
  orgId: string,
  fingerprint: string,
): Promise<FloorplanVizRunDetail | null> {
  const id = fingerprint.trim();
  if (!id) return null;
  const row = await prisma.floorplanVizRun.findFirst({
    where: { organizationId: orgId, inputFingerprint: id, stills: { some: {} } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!row) return null;
  return getFloorplanVizRunForOrg(orgId, row.id);
}

export async function findFloorplanLayoutByExtractFingerprint(
  orgId: string,
  fingerprint: string,
): Promise<FloorplanLayout | null> {
  const id = fingerprint.trim();
  if (!id) return null;
  const row = await prisma.floorplanVizRun.findFirst({
    where: { organizationId: orgId, extractFingerprint: id },
    orderBy: { createdAt: "desc" },
    select: { layoutJson: true },
  });
  if (!row) return null;
  return parseFloorplanLayout(row.layoutJson as Record<string, unknown>);
}

export async function createFloorplanVizRun(input: {
  orgId: string;
  userId: string;
  projectId?: string | null;
  title: string;
  sourceFileName?: string | null;
  planMimeType: string;
  planBase64: string;
  layout: FloorplanLayout;
  styleKit: FloorplanVizStyleKit;
  scope: FloorplanVizScope;
  photo?: boolean;
  extractFingerprint?: string | null;
  inputFingerprint?: string | null;
  enginesUsed: string[];
  ocrEngines: string[];
  visionEngines: string[];
  confidence?: ConfidenceReport;
  spend?: FloorplanSpend;
  images: FloorplanVizImage[];
}): Promise<FloorplanVizRunDetail> {
  const created = await prisma.floorplanVizRun.create({
    data: {
      organizationId: input.orgId,
      userId: input.userId,
      projectId: input.projectId || null,
      title: input.title.slice(0, 120),
      sourceFileName: input.sourceFileName?.slice(0, 200) ?? null,
      planMimeType: input.planMimeType,
      planBase64: input.planBase64,
      layoutJson: input.layout as object,
      styleKitJson: input.styleKit as object,
      styleLabelHe: input.styleKit.labelHe,
      scope: input.scope,
      photo: input.photo === true,
      extractFingerprint: input.extractFingerprint ?? null,
      inputFingerprint: input.inputFingerprint ?? null,
      enginesJson: {
        enginesUsed: input.enginesUsed,
        ocrEngines: input.ocrEngines,
        visionEngines: input.visionEngines,
        ...(input.confidence ? { confidence: input.confidence } : {}),
        ...(input.spend ? { spend: input.spend } : {}),
      },
    },
  });
  for (const [index, img] of input.images.entries()) {
    await prisma.floorplanVizStill.create({
      data: {
        runId: created.id,
        organizationId: input.orgId,
        viewId: img.viewId,
        viewKey: floorplanVizViewKey(img.viewId, img.roomName),
        labelHe: img.labelHe,
        roomName: img.roomName ?? null,
        mimeType: img.mimeType,
        dataBase64: img.base64,
        selected: true,
        parentStillId: img.parentStillId ?? null,
        origin: stillOriginOf(img),
        attemptIndex: img.attemptIndex ?? 1,
        editPrompt: packFloorplanVizStillMeta(img),
        sortOrder: stillSortOrder(img.viewId, img.roomName, index),
      },
    });
  }
  const detail = await getFloorplanVizRunForOrg(input.orgId, created.id);
  if (!detail) throw new Error("שמירת ההדמיה נכשלה");
  return detail;
}

export async function appendFloorplanVizStills(
  orgId: string,
  runId: string,
  images: FloorplanVizImage[],
  scope?: FloorplanVizScope,
): Promise<FloorplanVizRunDetail | null> {
  const existing = await prisma.floorplanVizRun.findFirst({
    where: { id: runId, organizationId: orgId },
    select: { id: true, stills: { select: { viewKey: true, attemptIndex: true } } },
  });
  if (!existing) return null;
  const nextIndex = new Map<string, number>();
  for (const row of existing.stills) {
    nextIndex.set(row.viewKey, Math.max(nextIndex.get(row.viewKey) ?? 0, row.attemptIndex));
  }
  for (const [index, img] of images.entries()) {
    const viewKey = floorplanVizViewKey(img.viewId, img.roomName);
    const attemptIndex = (nextIndex.get(viewKey) ?? 0) + 1;
    nextIndex.set(viewKey, attemptIndex);
    await prisma.floorplanVizStill.updateMany({
      where: { runId, viewKey, selected: true },
      data: { selected: false },
    });
    await prisma.floorplanVizStill.create({
      data: {
        runId,
        organizationId: orgId,
        viewId: img.viewId,
        viewKey,
        labelHe: img.labelHe,
        roomName: img.roomName ?? null,
        mimeType: img.mimeType,
        dataBase64: img.base64,
        selected: true,
        parentStillId: img.parentStillId ?? null,
        origin: stillOriginOf(img),
        attemptIndex,
        editPrompt: packFloorplanVizStillMeta(img),
        sortOrder: stillSortOrder(img.viewId, img.roomName, index),
      },
    });
  }
  await prisma.floorplanVizRun.update({
    where: { id: runId },
    data: {
      ...(scope ? { scope } : {}),
      updatedAt: new Date(),
    },
  });
  return getFloorplanVizRunForOrg(orgId, runId);
}

export async function updateFloorplanVizRunMeta(
  orgId: string,
  runId: string,
  patch: { title?: string; projectId?: string | null },
): Promise<FloorplanVizRunDetail | null> {
  const existing = await prisma.floorplanVizRun.findFirst({
    where: { id: runId, organizationId: orgId },
    select: { id: true },
  });
  if (!existing) return null;
  const data: { title?: string; projectId?: string | null } = {};
  if (typeof patch.title === "string") data.title = patch.title.trim().slice(0, 120) || "הדמיית תוכנית";
  if (patch.projectId !== undefined) data.projectId = patch.projectId;
  await prisma.floorplanVizRun.update({ where: { id: runId }, data });
  return getFloorplanVizRunForOrg(orgId, runId);
}

export async function deleteFloorplanVizRun(orgId: string, runId: string): Promise<boolean> {
  const existing = await prisma.floorplanVizRun.findFirst({
    where: { id: runId, organizationId: orgId },
    select: { id: true },
  });
  if (!existing) return false;
  await prisma.floorplanVizRun.delete({ where: { id: runId } });
  return true;
}

/** Includes the parent run — callers that only serve the image want the lean query below. */
export async function getFloorplanVizStillForOrg(orgId: string, runId: string, stillId: string) {
  return prisma.floorplanVizStill.findFirst({
    where: { id: stillId, runId, organizationId: orgId },
    include: { run: true },
  });
}

/**
 * Just enough to serve one still. The `include: { run: true }` above drags the
 * whole run row — layout, style kit, and a ~0.4MB planBase64 — which is dead
 * weight on an image request.
 */
export async function getFloorplanVizStillBytesForOrg(
  orgId: string,
  runId: string,
  stillId: string,
): Promise<{ mimeType: string; dataBase64: string; updatedAt: Date } | null> {
  return prisma.floorplanVizStill.findFirst({
    where: { id: stillId, runId, organizationId: orgId },
    select: { mimeType: true, dataBase64: true, updatedAt: true },
  });
}

export async function appendFloorplanVizStillEdit(
  orgId: string,
  runId: string,
  stillId: string,
  image: { mimeType: string; base64: string; editPrompt?: string; auditIssues?: string[] },
): Promise<FloorplanVizRunDetail | null> {
  const existing = await prisma.floorplanVizStill.findFirst({
    where: { id: stillId, runId, organizationId: orgId },
  });
  if (!existing) return null;
  return appendFloorplanVizStills(orgId, runId, [
    {
      viewId: parseFloorplanVizViewId(existing.viewId),
      labelHe: existing.labelHe,
      roomName: existing.roomName ?? undefined,
      mimeType: image.mimeType,
      base64: image.base64,
      parentStillId: existing.id,
      origin: "edit",
      editPrompt: image.editPrompt,
      auditIssues: image.auditIssues,
    },
  ]);
}

/** Update packed auditIssues on an existing still without creating a new attempt. */
export async function updateFloorplanVizStillAuditIssues(
  orgId: string,
  runId: string,
  stillId: string,
  auditIssues: string[],
): Promise<FloorplanVizRunDetail | null> {
  const existing = await prisma.floorplanVizStill.findFirst({
    where: { id: stillId, runId, organizationId: orgId },
  });
  if (!existing) return null;
  const meta = unpackFloorplanVizStillMeta(existing.editPrompt);
  const packed = packFloorplanVizStillMeta({
    editPrompt: meta.editPrompt,
    auditIssues,
  });
  await prisma.floorplanVizStill.update({
    where: { id: stillId },
    data: { editPrompt: packed },
  });
  await prisma.floorplanVizRun.update({ where: { id: runId }, data: { updatedAt: new Date() } });
  return getFloorplanVizRunForOrg(orgId, runId);
}

export async function selectFloorplanVizStill(
  orgId: string,
  runId: string,
  stillId: string,
): Promise<FloorplanVizRunDetail | null> {
  const existing = await prisma.floorplanVizStill.findFirst({
    where: { id: stillId, runId, organizationId: orgId },
    select: { id: true, viewKey: true },
  });
  if (!existing) return null;
  await prisma.$transaction([
    prisma.floorplanVizStill.updateMany({
      where: { runId, viewKey: existing.viewKey, selected: true },
      data: { selected: false },
    }),
    prisma.floorplanVizStill.update({
      where: { id: stillId },
      data: { selected: true },
    }),
    prisma.floorplanVizRun.update({ where: { id: runId }, data: { updatedAt: new Date() } }),
  ]);
  return getFloorplanVizRunForOrg(orgId, runId);
}

export async function deleteFloorplanVizStill(orgId: string, runId: string, stillId: string): Promise<boolean> {
  const existing = await prisma.floorplanVizStill.findFirst({
    where: { id: stillId, runId, organizationId: orgId },
    select: { id: true, viewKey: true, selected: true },
  });
  if (!existing) return false;
  await prisma.floorplanVizStill.delete({ where: { id: stillId } });
  if (existing.selected) {
    const latest = await prisma.floorplanVizStill.findFirst({
      where: { runId, viewKey: existing.viewKey },
      orderBy: [{ attemptIndex: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    if (latest) {
      await prisma.floorplanVizStill.update({ where: { id: latest.id }, data: { selected: true } });
    }
  }
  await prisma.floorplanVizRun.update({ where: { id: runId }, data: { updatedAt: new Date() } });
  return true;
}

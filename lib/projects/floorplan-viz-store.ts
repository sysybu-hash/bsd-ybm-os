import { prisma } from "@/lib/prisma";
import {
  parseFloorplanLayout,
  type FloorplanLayout,
  type FloorplanVizImage,
} from "@/lib/projects/floorplan-layout";
import { resolveFloorplanVizStyle, type FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";
import { parseFloorplanVizScope, type FloorplanVizScope } from "@/lib/projects/floorplan-viz-scope";
import {
  floorplanVizStillFilePath,
  floorplanVizViewKey,
  parseFloorplanVizViewId,
  type FloorplanVizRunSummary,
} from "@/lib/projects/floorplan-viz-ids";

export {
  floorplanVizStillFilePath,
  floorplanVizViewKey,
  parseFloorplanVizViewId,
};
export type { FloorplanVizRunSummary };

function stillSortOrder(viewId: string, index: number): number {
  if (viewId === "overview") return 0;
  if (viewId === "isometric") return 1;
  return 10 + index;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is string => typeof row === "string");
}

type EnginesJson = {
  enginesUsed?: string[];
  ocrEngines?: string[];
  visionEngines?: string[];
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
}): FloorplanVizImage {
  return {
    id: still.id,
    viewId: parseFloorplanVizViewId(still.viewId),
    labelHe: still.labelHe,
    roomName: still.roomName ?? undefined,
    mimeType: still.mimeType,
    base64: still.dataBase64,
    src: floorplanVizStillFilePath(runId, still.id),
  };
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
      _count: { select: { stills: true } },
      stills: {
        orderBy: { sortOrder: "asc" },
        take: 1,
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
    stillCount: row._count.stills,
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
      },
      stills: {
        create: input.images.map((img, index) => ({
          organizationId: input.orgId,
          viewId: img.viewId,
          viewKey: floorplanVizViewKey(img.viewId, img.roomName),
          labelHe: img.labelHe,
          roomName: img.roomName ?? null,
          mimeType: img.mimeType,
          dataBase64: img.base64,
          sortOrder: stillSortOrder(img.viewId, index),
        })),
      },
    },
  });
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
    select: { id: true, stills: { select: { sortOrder: true } } },
  });
  if (!existing) return null;
  const maxSort = existing.stills.reduce((acc, row) => Math.max(acc, row.sortOrder), 0);
  await prisma.$transaction(
    images.map((img, index) =>
      prisma.floorplanVizStill.upsert({
        where: { runId_viewKey: { runId, viewKey: floorplanVizViewKey(img.viewId, img.roomName) } },
        create: {
          runId,
          organizationId: orgId,
          viewId: img.viewId,
          viewKey: floorplanVizViewKey(img.viewId, img.roomName),
          labelHe: img.labelHe,
          roomName: img.roomName ?? null,
          mimeType: img.mimeType,
          dataBase64: img.base64,
          sortOrder: stillSortOrder(img.viewId, maxSort + 1 + index),
        },
        update: {
          labelHe: img.labelHe,
          mimeType: img.mimeType,
          dataBase64: img.base64,
        },
      }),
    ),
  );
  if (scope) {
    await prisma.floorplanVizRun.update({
      where: { id: runId },
      data: { scope },
    });
  }
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

export async function updateFloorplanVizStillImage(
  orgId: string,
  runId: string,
  stillId: string,
  image: { mimeType: string; base64: string; editPrompt?: string },
): Promise<FloorplanVizImage | null> {
  const existing = await prisma.floorplanVizStill.findFirst({
    where: { id: stillId, runId, organizationId: orgId },
    select: { id: true },
  });
  if (!existing) return null;
  const updated = await prisma.floorplanVizStill.update({
    where: { id: stillId },
    data: {
      mimeType: image.mimeType,
      dataBase64: image.base64,
      editPrompt: image.editPrompt?.slice(0, 2000) ?? undefined,
    },
  });
  await prisma.floorplanVizRun.update({ where: { id: runId }, data: { updatedAt: new Date() } });
  return stillToImage(runId, updated);
}

export async function deleteFloorplanVizStill(orgId: string, runId: string, stillId: string): Promise<boolean> {
  const existing = await prisma.floorplanVizStill.findFirst({
    where: { id: stillId, runId, organizationId: orgId },
    select: { id: true },
  });
  if (!existing) return false;
  await prisma.floorplanVizStill.delete({ where: { id: stillId } });
  await prisma.floorplanVizRun.update({ where: { id: runId }, data: { updatedAt: new Date() } });
  return true;
}

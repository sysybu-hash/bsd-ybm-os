import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { readDxfDrawing, type DxfDrawing } from "@/lib/projects/dxf-drawing";
import { ownProject } from "@/lib/vmb/project-files";
import { DEEP_DEPTH, previewRescan, suggestLayers, type RescanPreview } from "@/lib/vmb/rescan";
import { scanDrawing, type ScanResult } from "@/lib/vmb/scan";
import { toScanViews, type ScanView } from "@/lib/vmb/scan-view";

const log = createLogger("vmb-scan");

/** Kinds the scan reads today; PDF, DWF and DWG come with their readers. */
export const SCANNABLE_KINDS = new Set(["dxf"]);

type Fail = { ok: false; code: "not_found" | "kind_not_scanned" | "fetch_failed" | "unreadable" };
export type ScanOutcome = { ok: true; scan: ScanView } | Fail;
export type PreviewOutcome = { ok: true; preview: RescanPreview } | Fail;

/** The user's file, opened as a drawing. */
async function openFile(userId: string, projectId: string, fileId: string): Promise<{ ok: true; relPath: string; drawing: DxfDrawing } | Fail> {
  const project = await ownProject(userId, projectId);
  if (!project) return { ok: false, code: "not_found" };
  const file = await prisma.vmbProjectFile.findFirst({ where: { id: fileId, projectId }, select: { relPath: true, kind: true, blobUrl: true } });
  if (!file) return { ok: false, code: "not_found" };
  if (!SCANNABLE_KINDS.has(file.kind)) return { ok: false, code: "kind_not_scanned" };
  let bytes: Uint8Array;
  try {
    const res = await fetch(file.blobUrl);
    if (!res.ok) throw new Error(`blob ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (err: unknown) {
    log.warn("scan fetch failed", { projectId, error: err instanceof Error ? err.message : String(err) });
    return { ok: false, code: "fetch_failed" };
  }
  const drawing = readDxfDrawing(bytes);
  return drawing ? { ok: true, relPath: file.relPath, drawing } : { ok: false, code: "unreadable" };
}

async function storeRound(projectId: string, fileName: string, round: number, result: ScanResult): Promise<ScanOutcome> {
  const data = { counts: result.counts, unread: result.unread, facts: result.facts, inkCoverage: null };
  const row = await prisma.vmbScanReport.upsert({
    where: { projectId_fileName_round: { projectId, fileName, round } },
    create: { projectId, fileName, round, ...data },
    update: data,
    select: { fileName: true, round: true, counts: true, inkCoverage: true, unread: true, createdAt: true },
  });
  const [scan] = toScanViews([row]);
  return scan ? { ok: true, scan } : { ok: false, code: "unreadable" };
}

/** Scans one uploaded file (round 1) and stores its report; a new first round makes an earlier second one stale. */
export async function scanProjectFile(userId: string, projectId: string, fileId: string): Promise<ScanOutcome> {
  const f = await openFile(userId, projectId, fileId);
  if (!f.ok) return f;
  const started = Date.now();
  const result = scanDrawing(f.drawing);
  await prisma.vmbScanReport.deleteMany({ where: { projectId, fileName: f.relPath, round: { gt: 1 } } });
  // The first sheet read moves a new project on to its questions.
  await prisma.vmbProject.updateMany({ where: { id: projectId, status: "draft" }, data: { status: "identified" } });
  log.info("scanned", { projectId, ms: Date.now() - started, entities: result.counts.entities.total });
  return storeRound(projectId, f.relPath, 1, result);
}

/** What a second scan would find in one file; nothing is stored. */
export async function previewFileRescan(userId: string, projectId: string, fileId: string): Promise<PreviewOutcome> {
  const f = await openFile(userId, projectId, fileId);
  if (!f.ok) return f;
  return { ok: true, preview: previewRescan(f.drawing) };
}

/**
 * Runs the second scan with the layers the user approved and stores it as round 2. Only layers the second round itself
 * suggested are taken, with the kind it found — a request cannot read a layer as something the readers did not say.
 * The approved map is kept in the project manifest, where the builders read it.
 */
export async function applyFileRescan(userId: string, projectId: string, fileId: string, accept: string[]): Promise<ScanOutcome> {
  const f = await openFile(userId, projectId, fileId);
  if (!f.ok) return f;
  const wanted = new Set(accept);
  const layerMap = Object.fromEntries(suggestLayers(f.drawing).filter((s) => wanted.has(s.layer)).map((s) => [s.layer, s.kind]));
  const result = scanDrawing(f.drawing, { layerMap, maxDepth: DEEP_DEPTH });

  const project = await prisma.vmbProject.findUnique({ where: { id: projectId }, select: { manifest: true } });
  const manifest = project?.manifest && typeof project.manifest === "object" && !Array.isArray(project.manifest) ? (project.manifest as Prisma.JsonObject) : {};
  const maps = manifest.layerMaps && typeof manifest.layerMaps === "object" && !Array.isArray(manifest.layerMaps) ? (manifest.layerMaps as Prisma.JsonObject) : {};
  await prisma.vmbProject.update({
    where: { id: projectId },
    data: { manifest: { ...manifest, layerMaps: { ...maps, [f.relPath]: layerMap } } },
  });
  log.info("rescanned", { projectId, approved: Object.keys(layerMap).length, read: result.counts.entities.read });
  return storeRound(projectId, f.relPath, 2, result);
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { ownProject } from "@/lib/vmb/project-files";
import { scanDxf } from "@/lib/vmb/scan";
import { toScanViews, type ScanView } from "@/lib/vmb/scan-view";

const log = createLogger("vmb-scan");

/** Kinds the scan reads today; PDF, DWF and DWG come with their readers. */
export const SCANNABLE_KINDS = new Set(["dxf"]);

export type ScanOutcome = { ok: true; scan: ScanView } | { ok: false; code: "not_found" | "kind_not_scanned" | "fetch_failed" | "unreadable" };

/** Scans one uploaded file (round 1) and stores its report, replacing an earlier first round. */
export async function scanProjectFile(userId: string, projectId: string, fileId: string): Promise<ScanOutcome> {
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

  const started = Date.now();
  const result = scanDxf(bytes);
  if (!result) return { ok: false, code: "unreadable" };
  const data = { counts: result.counts, unread: result.unread, inkCoverage: null };
  const row = await prisma.vmbScanReport.upsert({
    where: { projectId_fileName_round: { projectId, fileName: file.relPath, round: 1 } },
    create: { projectId, fileName: file.relPath, round: 1, ...data },
    update: data,
    select: { fileName: true, round: true, counts: true, inkCoverage: true, unread: true, createdAt: true },
  });
  log.info("scanned", { projectId, ms: Date.now() - started, entities: result.counts.entities.total });
  const [scan] = toScanViews([row]);
  return scan ? { ok: true, scan } : { ok: false, code: "unreadable" };
}

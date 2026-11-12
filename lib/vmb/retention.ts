import "server-only";
import { deleteProjectBlobs } from "@/lib/projects/pipeline/project-blob";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

/**
 * Privacy (rule 13.11): an office's source sheets are deleted a set number of days after a booklet is delivered from
 * them. The office picks the number on its account page; the booklet itself and the scan summaries stay.
 */

const log = createLogger("vmb-retention");
const DAY = 86_400_000;

/** What an office may choose; null keeps the files until deleted by hand. */
export const RETENTION_CHOICES = [7, 30, 90, null] as const;
export type RetentionDays = (typeof RETENTION_CHOICES)[number];

export function isRetentionChoice(v: unknown): v is RetentionDays {
  return (RETENTION_CHOICES as readonly unknown[]).includes(v);
}

/** When the files of a booklet delivered at `deliveredAt` go; null when the office keeps them. */
export function filesDeleteAt(deliveredAt: Date, days: number | null): Date | null {
  return days == null ? null : new Date(deliveredAt.getTime() + days * DAY);
}

/** Only the office's owner changes its policy. */
export async function setRetention(userId: string, workspaceId: string, days: RetentionDays): Promise<boolean> {
  const m = await prisma.vmbMembership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } });
  if (m?.role !== "owner") return false;
  await prisma.vmbWorkspace.update({ where: { id: workspaceId }, data: { fileRetentionDays: days } });
  log.info("retention set", { workspaceId, days });
  return true;
}

const asObject = (v: Prisma.JsonValue | null): Prisma.JsonObject => (v && typeof v === "object" && !Array.isArray(v) ? (v as Prisma.JsonObject) : {});

/**
 * Deletes the source files of every project whose time has come: storage first, then the rows. A project with a run
 * going is skipped until it ends. Returns how many projects were cleared.
 */
export async function purgeExpiredFiles(now = new Date()): Promise<number> {
  const due = await prisma.vmbProject.findMany({
    where: { filesDeleteAt: { lte: now }, status: { not: "running" } },
    select: { id: true, manifest: true, files: { select: { blobUrl: true } } },
    take: 50,
  });
  let cleared = 0;
  for (const p of due) {
    const urls = p.files.map((f) => f.blobUrl);
    try {
      if (urls.length) await deleteProjectBlobs(urls);
    } catch (err: unknown) {
      // Storage refused: keep the rows so the next run tries again.
      log.warn("files purge failed", { projectId: p.id, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    await prisma.$transaction([
      prisma.vmbProjectFile.deleteMany({ where: { projectId: p.id } }),
      prisma.vmbProject.update({
        where: { id: p.id },
        data: { filesDeleteAt: null, manifest: { ...asObject(p.manifest), filesDeletedAt: now.toISOString() } },
      }),
    ]);
    cleared++;
  }
  if (cleared) log.info("files purged", { projects: cleared });
  return cleared;
}

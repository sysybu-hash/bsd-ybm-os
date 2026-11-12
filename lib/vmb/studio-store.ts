import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFloorplanBlobUrl } from "@/lib/projects/floorplan-blob";
import { projectBooklet, projectCameras } from "@/lib/vmb/outcome";
import { projectsOfUser } from "@/lib/vmb/projects";
import type { VmbStudioCamera } from "@/lib/validation/schemas/vmb-studio";

/**
 * The studio's files (plan M3) are read through here, never handed to the browser as Blob addresses: the page asks for
 * a project's part, and only someone in its office gets it.
 */

const asObject = (v: Prisma.JsonValue | null | undefined): Prisma.JsonObject => (v && typeof v === "object" && !Array.isArray(v) ? (v as Prisma.JsonObject) : {});

export type StudioPart = "data" | "sheet";

/** `key` names a storey's sheet of a house or a building; without it, a flat's one sheet. */
export async function studioPart(userId: string, projectId: string, part: StudioPart, key?: string): Promise<{ body: ArrayBuffer; type: string } | null> {
  const p = await prisma.vmbProject.findFirst({ where: { id: projectId, ...projectsOfUser(userId) }, select: { manifest: true } });
  const studio = p ? projectBooklet(p.manifest)?.studio : undefined;
  const url = part === "data" ? studio?.dataUrl : key ? studio?.sheets?.[key] : studio?.sheetUrl;
  if (!url || !isFloorplanBlobUrl(url)) return null;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return { body: await res.arrayBuffer(), type: part === "data" ? "application/json" : "image/jpeg" };
}

/** The cameras the client keeps on the project; the next run renders them. Not while a run is going. */
export async function setCameras(userId: string, projectId: string, cameras: VmbStudioCamera[]): Promise<{ ok: true } | { ok: false; code: "not_found" | "running" }> {
  const project = await prisma.vmbProject.findFirst({ where: { id: projectId, ...projectsOfUser(userId) }, select: { id: true, status: true, manifest: true } });
  if (!project) return { ok: false, code: "not_found" };
  if (project.status === "running") return { ok: false, code: "running" };
  const manifest: Prisma.JsonObject = { ...asObject(project.manifest), cameras: cameras as unknown as Prisma.JsonArray };
  await prisma.vmbProject.update({ where: { id: project.id }, data: { manifest } });
  return { ok: true };
}

export { projectCameras };

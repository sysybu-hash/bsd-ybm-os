import "server-only";
import { deleteProjectBlobs, headProjectBlob, isProjectBlobUrl } from "@/lib/projects/pipeline/project-blob";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { capacityProblem, fileKind, projectBlobPrefix, safeRelPath } from "@/lib/vmb/files";
import { projectsOfUser } from "@/lib/vmb/projects";

const log = createLogger("vmb-project-files");

/** The project if the user may write to it, else null. */
export async function ownProject(userId: string, projectId: string) {
  return prisma.vmbProject.findFirst({ where: { id: projectId, ...projectsOfUser(userId) }, select: { id: true, workspaceId: true } });
}

export async function projectUsage(projectId: string, exceptRelPath?: string) {
  const agg = await prisma.vmbProjectFile.aggregate({
    where: { projectId, ...(exceptRelPath ? { NOT: { relPath: exceptRelPath } } : {}) },
    _count: { _all: true },
    _sum: { size: true },
  });
  return { count: agg._count._all, bytes: agg._sum.size ?? 0 };
}

export type RegisterResult =
  | { ok: true; file: { id: string; relPath: string; kind: string; size: number } }
  | { ok: false; code: "not_found" | "bad_path" | "bad_kind" | "not_in_store" | "too_many_files" | "project_too_large" | "file_too_large" };

/**
 * Records a file the browser has just uploaded. The blob is looked up in our
 * own store (a URL from anywhere else fails), must sit under this project's
 * prefix, and must be a kind VMB reads. Re-uploading a path replaces it.
 */
export async function registerUploadedFile(input: { userId: string; projectId: string; url: string; relPath: string }): Promise<RegisterResult> {
  const project = await ownProject(input.userId, input.projectId);
  if (!project) return { ok: false, code: "not_found" };
  const rel = safeRelPath(input.relPath);
  if (!rel) return { ok: false, code: "bad_path" };
  const kind = fileKind(rel);
  if (!kind) return { ok: false, code: "bad_kind" };

  if (!isProjectBlobUrl(input.url)) return { ok: false, code: "not_in_store" };
  let blob: Awaited<ReturnType<typeof headProjectBlob>>;
  try {
    blob = await headProjectBlob(input.url);
  } catch {
    return { ok: false, code: "not_in_store" };
  }
  if (!blob.pathname.startsWith(projectBlobPrefix(project.id))) return { ok: false, code: "bad_path" };

  const usage = await projectUsage(project.id, rel);
  const problem = capacityProblem([{ size: blob.size }], usage.count, usage.bytes);
  if (problem) {
    await deleteProjectBlobs([blob.url]).catch(() => undefined);
    return { ok: false, code: problem };
  }

  const previous = await prisma.vmbProjectFile.findUnique({
    where: { projectId_relPath: { projectId: project.id, relPath: rel } },
    select: { blobUrl: true },
  });
  const data = { kind, size: blob.size, contentType: blob.contentType, blobUrl: blob.url, blobPath: blob.pathname, uploadedBy: input.userId };
  const file = await prisma.vmbProjectFile.upsert({
    where: { projectId_relPath: { projectId: project.id, relPath: rel } },
    create: { projectId: project.id, relPath: rel, ...data },
    update: data,
    select: { id: true, relPath: true, kind: true, size: true },
  });
  // New sheets restart the clock: they are deleted only after the next booklet is delivered.
  await prisma.vmbProject.update({ where: { id: project.id }, data: { updatedAt: new Date(), filesDeleteAt: null } });
  if (previous && previous.blobUrl !== blob.url) {
    // A new version of the sheet: its old scan no longer describes it.
    await prisma.vmbScanReport.deleteMany({ where: { projectId: project.id, fileName: rel } });
    await deleteProjectBlobs([previous.blobUrl]).catch((err: unknown) => log.warn("old_blob_delete_failed", { error: err instanceof Error ? err.message : String(err) }));
  }
  return { ok: true, file };
}

/** Removes one file from the project and from storage. */
export async function deleteProjectFile(userId: string, projectId: string, fileId: string): Promise<boolean> {
  const file = await prisma.vmbProjectFile.findFirst({
    where: { id: fileId, projectId, project: projectsOfUser(userId) },
    select: { id: true, blobUrl: true, relPath: true },
  });
  if (!file) return false;
  await prisma.$transaction([
    prisma.vmbProjectFile.delete({ where: { id: file.id } }),
    prisma.vmbScanReport.deleteMany({ where: { projectId, fileName: file.relPath } }),
  ]);
  await deleteProjectBlobs([file.blobUrl]).catch((err: unknown) => log.warn("blob_delete_failed", { error: err instanceof Error ? err.message : String(err) }));
  return true;
}

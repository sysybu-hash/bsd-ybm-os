import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuth } from "@/lib/api-handler";
import {
  filterArchiveFiles,
  mapDocumentToArchive,
  mapIssuedToArchive,
  type ArchiveFileCategory,
} from "@/lib/erp-archive";

/** ארכיון ERP מאוחד: מסמכים מונפקים + סריקות AI */
export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const category = (searchParams.get("type") ?? "all") as ArchiveFileCategory | "all";
  const projectId = searchParams.get("projectId");
  const recentOnly = searchParams.get("recent") === "1";

  const [documents, issued, projects] = await Promise.all([
    prisma.document.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.issuedDocument.findMany({
      where: { organizationId: orgId },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.project.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const files = [
    ...issued.map(mapIssuedToArchive),
    ...documents.map(mapDocumentToArchive),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const filtered = filterArchiveFiles(files, {
    q,
    category: category === "all" ? undefined : category,
    projectId: projectId || undefined,
    recentOnly,
  });

  return NextResponse.json({
    files: filtered,
    projects,
    totalCount: files.length,
  });
});

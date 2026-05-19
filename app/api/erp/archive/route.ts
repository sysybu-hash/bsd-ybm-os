import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuth } from "@/lib/api-handler";
import {
  filterArchiveFiles,
  mapDocumentToArchive,
  mapIssuedToArchive,
  type ArchiveFileCategory,
  type ArchiveView,
} from "@/lib/erp-archive";

function parseArchiveView(raw: string | null): ArchiveView {
  if (raw === "shared" || raw === "trash") return raw;
  return "active";
}

/** ארכיון ERP מאוחד: מסמכים מונפקים + סריקות AI */
export const GET = withWorkspacesAuth(async (req, { orgId, userId }) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const category = (searchParams.get("type") ?? "all") as ArchiveFileCategory | "all";
  const projectId = searchParams.get("projectId");
  const recentOnly = searchParams.get("recent") === "1";
  const view = parseArchiveView(searchParams.get("view"));

  const inTrash = view === "trash";
  const sharedOnly = view === "shared";

  const [documents, issued, projects, trashCount] = await Promise.all([
    prisma.document.findMany({
      where: {
        organizationId: orgId,
        deletedAt: inTrash ? { not: null } : null,
        ...(sharedOnly ? { userId: { not: userId } } : {}),
      },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.issuedDocument.findMany({
      where: {
        organizationId: orgId,
        deletedAt: inTrash ? { not: null } : null,
        ...(sharedOnly ? { createdByUserId: { not: userId } } : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
        createdByUser: { select: { name: true, email: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.project.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.$transaction([
      prisma.document.count({ where: { organizationId: orgId, deletedAt: { not: null } } }),
      prisma.issuedDocument.count({ where: { organizationId: orgId, deletedAt: { not: null } } }),
    ]).then(([a, b]) => a + b),
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

  const activeCount = await prisma.$transaction([
    prisma.document.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.issuedDocument.count({ where: { organizationId: orgId, deletedAt: null } }),
  ]).then(([a, b]) => a + b);

  return NextResponse.json({
    files: filtered,
    projects,
    totalCount: activeCount,
    trashCount,
    view,
  });
});

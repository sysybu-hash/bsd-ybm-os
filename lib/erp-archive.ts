import type { DocType, Document, IssuedDocument, Project } from "@prisma/client";
import { documentTypeLabel } from "@/lib/document-types";

export type ArchiveFileCategory = "invoice" | "quote" | "contract" | "other" | "SIGNED_QUOTE";

/** תצוגת סרגל צד בארכיון */
export type ArchiveView = "active" | "shared" | "trash";

export type ErpArchiveFile = {
  id: string;
  name: string;
  category: ArchiveFileCategory;
  sizeLabel: string;
  updatedAt: string;
  projectId: string | null;
  projectName: string;
  source: "issued" | "document";
  sourceId: string;
  clientName?: string;
  total?: number;
  docTypeLabel?: string;
  /** שם המשתמש שהעלה/הפיק (ל«שותפו איתי») */
  ownerName?: string;
  deletedAt?: string;
  isTrash: boolean;
};

export function issuedDocToArchiveCategory(type: DocType): ArchiveFileCategory {
  switch (type) {
    case "QUOTE":
      return "quote";
    case "INVOICE":
    case "INVOICE_RECEIPT":
    case "TRANSACTION_INVOICE":
    case "CREDIT_NOTE":
    case "RECEIPT":
      return "invoice";
    default:
      return "other";
  }
}

export function scanDocToArchiveCategory(type: string): ArchiveFileCategory {
  const u = type.toUpperCase();
  if (u === "SIGNED_QUOTE") return "SIGNED_QUOTE";
  if (u.includes("QUOTE") || u.includes("הצע")) return "quote";
  if (u.includes("CONTRACT") || u.includes("חוזה")) return "contract";
  if (u.includes("INVOICE") || u.includes("חשבונ") || u.includes("קבלה")) return "invoice";
  return "other";
}

type ArchiveUserPick = { name: string | null; email: string };

function displayUserName(user?: ArchiveUserPick | null): string | undefined {
  if (!user) return undefined;
  return user.name?.trim() || user.email || undefined;
}

export function mapIssuedToArchive(
  doc: IssuedDocument & {
    project?: Pick<Project, "id" | "name"> | null;
    createdByUser?: ArchiveUserPick | null;
    deletedAt?: Date | null;
  },
): ErpArchiveFile {
  const label = documentTypeLabel(doc.type);
  return {
    id: `issued:${doc.id}`,
    name: `${label}_${doc.number}.pdf`,
    category: issuedDocToArchiveCategory(doc.type),
    sizeLabel: "PDF",
    updatedAt: (doc.deletedAt ?? doc.updatedAt ?? doc.createdAt).toISOString(),
    projectId: doc.projectId,
    projectName: doc.project?.name ?? "כללי",
    source: "issued",
    sourceId: doc.id,
    clientName: doc.clientName,
    total: doc.total,
    docTypeLabel: label,
    ownerName: displayUserName(doc.createdByUser),
    deletedAt: doc.deletedAt?.toISOString(),
    isTrash: doc.deletedAt != null,
  };
}

export function mapDocumentToArchive(
  doc: Document & { user?: ArchiveUserPick | null; deletedAt?: Date | null },
): ErpArchiveFile {
  const ai = doc.aiData as { projectName?: string; clientName?: string; total?: number } | null;
  return {
    id: `document:${doc.id}`,
    name: doc.fileName,
    category: scanDocToArchiveCategory(doc.type),
    sizeLabel: "סריקה",
    updatedAt: (doc.deletedAt ?? doc.createdAt).toISOString(),
    projectId: null,
    projectName: ai?.projectName ?? "כללי",
    source: "document",
    sourceId: doc.id,
    clientName: ai?.clientName,
    total: typeof ai?.total === "number" ? ai.total : undefined,
    docTypeLabel: doc.type,
    ownerName: displayUserName(doc.user),
    deletedAt: doc.deletedAt?.toISOString(),
    isTrash: doc.deletedAt != null,
  };
}

export function filterArchiveFiles(
  files: ErpArchiveFile[],
  opts: {
    q?: string;
    category?: ArchiveFileCategory | "all";
    projectId?: string | null;
    recentOnly?: boolean;
  },
): ErpArchiveFile[] {
  const q = opts.q?.trim().toLowerCase() ?? "";
  const recentCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;

  return files.filter((f) => {
    if (opts.category && opts.category !== "all" && f.category !== opts.category) return false;
    if (opts.projectId && f.projectId !== opts.projectId) return false;
    if (opts.recentOnly && new Date(f.updatedAt).getTime() < recentCutoff) return false;
    if (!q) return true;
    return (
      f.name.toLowerCase().includes(q) ||
      f.projectName.toLowerCase().includes(q) ||
      (f.clientName?.toLowerCase().includes(q) ?? false)
    );
  });
}

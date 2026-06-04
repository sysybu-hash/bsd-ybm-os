import type { FieldCopilotDraft } from "@/lib/validation/schemas/field-copilot";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";

// ── Client/Project picker row types + mappers (used by ClientProjectStep) ──

export type ContactRow = {
  id: string;
  name: string;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
};

export type SearchPreviewRow = {
  type: "project" | "contact";
  id: string;
  name: string;
};

export type ResultRow = {
  key: string;
  kind: "contact" | "project";
  name: string;
  subtitle: string | null;
  contactId: string | null;
  contactName: string | null;
  projectId: string | null;
  projectName: string | null;
};

export type ProjectListItem = { id: string; name: string; isActive?: boolean };

export function mapProjectRow(p: ProjectListItem): ResultRow {
  return {
    key: `project:${p.id}`,
    kind: "project",
    name: p.name,
    subtitle: null,
    contactId: null,
    contactName: null,
    projectId: p.id,
    projectName: p.name,
  };
}

export function mapContactRow(c: ContactRow): ResultRow {
  const projectId = c.project?.id ?? c.projectId ?? null;
  const projectName = c.project?.name ?? null;
  return {
    key: `contact:${c.id}`,
    kind: "contact",
    name: c.name,
    subtitle: projectName,
    contactId: c.id,
    contactName: c.name,
    projectId,
    projectName,
  };
}

export function mergeSearchResults(contacts: ContactRow[], preview: SearchPreviewRow[]): ResultRow[] {
  const rows = contacts.map(mapContactRow);
  const coveredProjectIds = new Set(rows.map((r) => r.projectId).filter(Boolean));

  for (const item of preview) {
    if (item.type === "contact") {
      if (rows.some((r) => r.contactId === item.id)) continue;
      rows.push({
        key: `contact:${item.id}`,
        kind: "contact",
        name: item.name,
        subtitle: null,
        contactId: item.id,
        contactName: item.name,
        projectId: null,
        projectName: null,
      });
      continue;
    }
    if (coveredProjectIds.has(item.id) || rows.some((r) => r.projectId === item.id)) continue;
    rows.push({
      key: `project:${item.id}`,
      kind: "project",
      name: item.name,
      subtitle: null,
      contactId: null,
      contactName: null,
      projectId: item.id,
      projectName: item.name,
    });
  }

  return rows.slice(0, 8);
}

/** האם ניתן לעבור משלב לקוח ללכידה */
export function canAdvanceFromClientStep(draft: FieldCopilotDraft | null): boolean {
  if (!draft) return false;
  const contactOk =
    typeof draft.contactName === "string" && draft.contactName.trim().length >= 2;
  const projectOk =
    Boolean(draft.projectId) ||
    (typeof draft.projectName === "string" && draft.projectName.trim().length >= 1);
  return contactOk || projectOk;
}

export function canAdvanceFromReviewStep(draft: FieldCopilotDraft | null): boolean {
  if (!draft?.analysis || typeof draft.analysis !== "object") return false;
  const a = draft.analysis as ScanExtractionV5;
  const rows = Array.isArray(a.lineItems) && a.lineItems.length > 0
    ? a.lineItems
    : Array.isArray(a.billOfQuantities)
      ? a.billOfQuantities.map((r) => ({ description: r.description }))
      : [];
  return rows.some((r) => typeof r.description === "string" && r.description.trim().length > 0);
}

export function canAdvanceFromCaptureStep(draft: FieldCopilotDraft | null): boolean {
  if (!draft) return false;
  const photoCount = draft.capture.photoAssetIds.length;
  return (
    Boolean(draft.capture.transcript?.trim()) ||
    photoCount > 0 ||
    Boolean(draft.capture.videoAssetId)
  );
}

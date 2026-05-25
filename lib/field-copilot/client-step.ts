import type { FieldCopilotDraft } from "@/lib/validation/schemas/field-copilot";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";

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

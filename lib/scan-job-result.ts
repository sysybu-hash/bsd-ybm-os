/**
 * תוצאת DocumentScanJob.result אחרי processDocumentAction — צורות שונות לפי persist.
 */
export function extractAiDataFromScanJobResult(result: unknown): {
  aiData: Record<string, unknown>;
  alreadyExportedDocumentId?: string;
} | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const r = result as Record<string, unknown>;

  const exported = r._exportedToDocumentId;
  if (typeof exported === "string" && exported.trim().length > 0) {
    return { aiData: {}, alreadyExportedDocumentId: exported.trim() };
  }

  const inner = r.aiData;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return { aiData: inner as Record<string, unknown> };
  }

  if ("vendor" in r || "lineItems" in r || "billOfQuantities" in r || "metadata" in r) {
    return { aiData: { ...r } };
  }

  return null;
}

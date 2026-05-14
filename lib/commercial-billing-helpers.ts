import { Prisma } from "@prisma/client";
import { DocType } from "@prisma/client";

/** סוגי מסמך שמייצגים «חיוב / גבייה» מול לקוח. */
const BILLING_COLLECTION_TYPES: readonly DocType[] = [DocType.INVOICE, DocType.INVOICE_RECEIPT];

export function isIssuedAwaitingCollectionType(type: string): boolean {
  return BILLING_COLLECTION_TYPES.includes(type as DocType);
}

export function isIssuedRemindable(
  type: string,
  status: string,
  hasEmail: boolean,
): boolean {
  return status === "PENDING" && isIssuedAwaitingCollectionType(type) && hasEmail;
}

/** בדיקת מסמך סריקה/ERP: דורש עדכון/הנפקה — תואם `load-insights-workspace` */
export function scannedDocumentNeedsCompletion(document: {
  status: string;
  aiData: Prisma.JsonValue | null;
  _count: { lineItems: number };
}): boolean {
  const ai = readAiForReview(document.aiData);
  const vendor = typeof ai.vendor === "string" ? ai.vendor.trim() : "";
  return document.status !== "PROCESSED" || document._count.lineItems === 0 || vendor.length === 0;
}

function readAiForReview(value: Prisma.JsonValue | null): { vendor?: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as { vendor?: string };
}

export function readScanProjectClientLabels(aiData: Prisma.JsonValue | null): {
  projectLabel: string | null;
  clientLabel: string | null;
} {
  if (aiData === null || typeof aiData !== "object" || Array.isArray(aiData)) {
    return { projectLabel: null, clientLabel: null };
  }
  const o = aiData as {
    documentMetadata?: { project?: string | null; client?: string | null };
  };
  const p = o.documentMetadata?.project?.trim();
  const c = o.documentMetadata?.client?.trim();
  return {
    projectLabel: p || null,
    clientLabel: c || null,
  };
}

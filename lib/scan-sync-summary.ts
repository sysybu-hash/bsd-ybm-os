import { prisma } from "@/lib/prisma";
import type { PriceSpikeAlert } from "@/lib/erp-price-spikes";

/** מפיק את שמות הפריטים מתוך נתוני AI של סריקה — תומך בכמה צורות שדה. */
export function collectScannedDescriptions(aiData: Record<string, unknown>): string[] {
  const items = Array.isArray(aiData.items)
    ? aiData.items
    : Array.isArray(aiData.lineItems)
      ? aiData.lineItems
      : [];
  const descriptions: string[] = [];
  for (const item of items) {
    if (item && typeof item === "object") {
      const desc = (item as Record<string, unknown>).description ?? (item as Record<string, unknown>).name;
      if (typeof desc === "string" && desc.trim()) descriptions.push(desc.trim());
    }
  }
  return descriptions;
}

/** מסנן רשימת spikes לאלו ששייכים לסריקה הספציפית (לפי תיאור הפריטים). */
export function filterAlertsForScan(
  allAlerts: PriceSpikeAlert[],
  aiData: Record<string, unknown>,
): PriceSpikeAlert[] {
  const descriptions = new Set(collectScannedDescriptions(aiData).map((d) => d.toLowerCase()));
  if (descriptions.size === 0) return allAlerts.slice(0, 3);
  return allAlerts.filter((a) => descriptions.has(a.description.toLowerCase()));
}

export type ScanSyncErpSummary = {
  documentId: string;
  fileName: string;
  vendor: string | null;
  total: number | null;
  currency: string | null;
  docType: string | null;
  lineItemCount: number;
};

export type ScanSyncCrmSummary = {
  contactId: string;
  contactName: string;
  status: string;
  isNew: boolean;
  email: string | null;
  phone: string | null;
  totalDocumentsThisYear: number;
} | null;

export type ScanSyncSummary = {
  erp: ScanSyncErpSummary;
  crm: ScanSyncCrmSummary;
  alerts: PriceSpikeAlert[];
};

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

/**
 * בונה סיכום סנכרון מאוחד אחרי סריקה: מה נכתב ל-ERP, מה עודכן ב-CRM, ואילו התראות הופקו.
 * משמש את כרטיס הסיכום ב-Dock ואת המנוע השיחתי ("שאל את ה-AI על הסריקה הזו").
 */
export async function buildScanSyncSummary(params: {
  organizationId: string;
  documentId: string;
  aiData: Record<string, unknown>;
  alerts: PriceSpikeAlert[];
  contactId?: string | null;
}): Promise<ScanSyncSummary> {
  const { organizationId, documentId, aiData, alerts, contactId } = params;

  const [doc, lineItemCount] = await Promise.all([
    prisma.document.findUnique({
      where: { id: documentId },
      select: { fileName: true, type: true },
    }),
    prisma.documentLineItem.count({ where: { documentId } }),
  ]);

  const erp: ScanSyncErpSummary = {
    documentId,
    fileName: doc?.fileName ?? "",
    vendor: pickString(aiData.vendor),
    total: pickNumber(aiData.total),
    currency: pickString(aiData.currency),
    docType: doc?.type ?? pickString(aiData.docType),
    lineItemCount,
  };

  let crm: ScanSyncCrmSummary = null;
  if (contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId },
      select: { id: true, name: true, status: true, email: true, phone: true, createdAt: true },
    });
    if (contact) {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1);
      const totalDocumentsThisYear = await prisma.document.count({
        where: {
          organizationId,
          aiData: { path: ["vendor"], equals: contact.name },
          createdAt: { gte: startOfYear },
        },
      });
      const ageMs = Date.now() - contact.createdAt.getTime();
      crm = {
        contactId: contact.id,
        contactName: contact.name,
        status: contact.status,
        isNew: ageMs < 60_000,
        email: contact.email,
        phone: contact.phone,
        totalDocumentsThisYear,
      };
    }
  }

  return { erp, crm, alerts };
}

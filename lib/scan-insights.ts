/**
 * תובנות עסקיות מסריקות — שלב 8 באפיון.
 *
 * שלוש תובנות ראשיות:
 *   1. זיהוי חשבונית כפולה — אותו ספק + סכום + תאריך קרוב → אזהרה
 *   2. התאמת ספק↔פרויקט/CRM — הצעת פרויקט על בסיס היסטוריה
 *   3. חילוץ תנאי תשלום / תאריך פירעון — NET30, שוטף+30 וכו'
 */
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("scan-insights");

// ── 1. זיהוי חשבונית כפולה ──────────────────────────────────────────────────

export type DuplicateInvoiceAlert = {
  existingDocumentId: string;
  existingFileName: string;
  existingDate: string | null;
  matchReason: "exact_hash" | "vendor_amount_date" | "vendor_amount_close_date";
  confidence: number;
};

/**
 * מחפש חשבוניות כפולות בארגון לפי:
 *   a) אותו ספק + אותו סכום + תאריך בטווח 3 ימים
 *   b) (עתידי) hash של תוכן
 */
export async function detectDuplicateInvoice(params: {
  organizationId: string;
  vendor: string;
  total: number;
  date: string | null;
  excludeDocumentId?: string;
}): Promise<DuplicateInvoiceAlert | null> {
  const { organizationId, vendor, total, date, excludeDocumentId } = params;
  if (!vendor || vendor === "לא צוין" || total <= 0) return null;

  try {
    // Search recent documents (last 90 days) with same vendor + similar amount
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const candidates = await prisma.document.findMany({
      where: {
        organizationId,
        deletedAt: null,
        createdAt: { gte: cutoff },
        ...(excludeDocumentId ? { id: { not: excludeDocumentId } } : {}),
      },
      select: { id: true, fileName: true, aiData: true, createdAt: true },
      take: 100,
      orderBy: { createdAt: "desc" },
    });

    for (const doc of candidates) {
      const aiData = doc.aiData as Record<string, unknown> | null;
      if (!aiData) continue;
      const docVendor = typeof aiData.vendor === "string" ? aiData.vendor : "";
      const docTotal = typeof aiData.total === "number" ? aiData.total : 0;
      const docDate = typeof aiData.date === "string" ? aiData.date : null;

      // Vendor match (case-insensitive, partial)
      const vendorMatch =
        docVendor.length > 0 &&
        (docVendor.toLowerCase().includes(vendor.toLowerCase()) ||
          vendor.toLowerCase().includes(docVendor.toLowerCase()));

      // Amount match (within 1%)
      const amountMatch = docTotal > 0 && Math.abs(docTotal - total) / total < 0.01;

      if (!vendorMatch || !amountMatch) continue;

      // Date match
      if (date && docDate) {
        const diff = Math.abs(
          new Date(date).getTime() - new Date(docDate).getTime(),
        );
        const daysDiff = diff / (1000 * 60 * 60 * 24);
        if (daysDiff <= 3) {
          return {
            existingDocumentId: doc.id,
            existingFileName: doc.fileName,
            existingDate: docDate,
            matchReason: daysDiff === 0 ? "vendor_amount_date" : "vendor_amount_close_date",
            confidence: daysDiff === 0 ? 0.95 : 0.8,
          };
        }
      } else if (!date && amountMatch && vendorMatch) {
        // No date — lower confidence
        return {
          existingDocumentId: doc.id,
          existingFileName: doc.fileName,
          existingDate: docDate,
          matchReason: "vendor_amount_date",
          confidence: 0.65,
        };
      }
    }
    return null;
  } catch (err: unknown) {
    log.warn("duplicate detection failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ── 2. התאמת ספק↔פרויקט ─────────────────────────────────────────────────────

export type VendorProjectSuggestion = {
  projectId: string;
  projectName: string;
  occurrences: number;
  confidence: number;
};

/**
 * מחפש באיזה פרויקטים הופיע הספק הזה בעבר ומציע את המתאים ביותר.
 */
export async function suggestProjectForVendor(params: {
  organizationId: string;
  vendor: string;
}): Promise<VendorProjectSuggestion | null> {
  const { organizationId, vendor } = params;
  if (!vendor || vendor === "לא צוין") return null;

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);

    const docs = await prisma.document.findMany({
      where: { organizationId, deletedAt: null, createdAt: { gte: cutoff } },
      select: { aiData: true },
      take: 200,
      orderBy: { createdAt: "desc" },
    });

    const projectCount: Record<string, { name: string; count: number }> = {};

    for (const doc of docs) {
      const aiData = doc.aiData as Record<string, unknown> | null;
      if (!aiData) continue;
      const docVendor = typeof aiData.vendor === "string" ? aiData.vendor : "";
      const meta = aiData.documentMetadata as Record<string, unknown> | null;
      const projectName = meta && typeof meta.project === "string" ? meta.project : null;

      if (!projectName) continue;
      const vendorMatch =
        docVendor.toLowerCase().includes(vendor.toLowerCase()) ||
        vendor.toLowerCase().includes(docVendor.toLowerCase());

      if (vendorMatch) {
        if (!projectCount[projectName]) {
          projectCount[projectName] = { name: projectName, count: 0 };
        }
        projectCount[projectName]!.count += 1;
      }
    }

    const sorted = Object.entries(projectCount).sort((a, b) => b[1].count - a[1].count);
    if (!sorted.length) return null;

    const [topName, topData] = sorted[0]!;

    // Try to find the project by name
    const project = await prisma.project.findFirst({
      where: { organizationId, name: { contains: topName, mode: "insensitive" }, isActive: true },
      select: { id: true, name: true },
    });

    const confidence = Math.min(0.95, 0.5 + topData.count * 0.1);

    return {
      projectId: project?.id ?? "",
      projectName: project?.name ?? topName,
      occurrences: topData.count,
      confidence,
    };
  } catch (err: unknown) {
    log.warn("vendor project suggestion failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ── 3. חילוץ תנאי תשלום ─────────────────────────────────────────────────────

export type PaymentTerms = {
  /** Original text found in the document */
  raw: string;
  /** Due date if deterministic (ISO string) */
  dueDate: string | null;
  /** Days until due from document date (e.g. 30 for NET30) */
  netDays: number | null;
  /** Payment condition type */
  type: "immediate" | "net" | "end_of_month" | "installments" | "unknown";
};

const NET_PATTERNS: Array<{ re: RegExp; days: number; type: PaymentTerms["type"] }> = [
  { re: /שוטף\s*\+\s*(\d+)/i, days: -1, type: "end_of_month" },     // שוטף+30
  { re: /net\s*(\d+)/i, days: -1, type: "net" },                      // NET30
  { re: /(\d+)\s*ימי?\s*(?:תשלום|אשראי|ימי)/i, days: -1, type: "net" },
  { re: /לאלתר|מיידי|immediate/i, days: 0, type: "immediate" },
];

export function extractPaymentTerms(summary: string, docDate: string | null): PaymentTerms | null {
  if (!summary) return null;

  for (const { re, days: daysTemplate, type } of NET_PATTERNS) {
    const match = re.exec(summary);
    if (!match) continue;

    const raw = match[0] ?? "";
    let netDays: number | null = null;
    let dueDate: string | null = null;

    if (daysTemplate === 0) {
      netDays = 0;
      dueDate = docDate;
    } else {
      // Extract number from capture group
      const n = parseInt(match[1] ?? "", 10);
      netDays = isNaN(n) ? null : n;
      if (netDays !== null && docDate) {
        const d = new Date(docDate);
        if (type === "end_of_month") {
          // שוטף+N: end of this month + N days
          d.setMonth(d.getMonth() + 1, 0); // last day of current month
          d.setDate(d.getDate() + netDays);
        } else {
          d.setDate(d.getDate() + netDays);
        }
        dueDate = d.toISOString().split("T")[0]!;
      }
    }

    return { raw, dueDate, netDays, type };
  }

  return null;
}

// ── Orchestrator: run all insights after extraction ──────────────────────────

export type ScanInsights = {
  duplicate: DuplicateInvoiceAlert | null;
  vendorProject: VendorProjectSuggestion | null;
  paymentTerms: PaymentTerms | null;
};

export async function runScanInsights(params: {
  organizationId: string;
  vendor: string;
  total: number;
  date: string | null;
  summary: string;
  documentId?: string;
}): Promise<ScanInsights> {
  const { organizationId, vendor, total, date, summary, documentId } = params;

  const [duplicate, vendorProject] = await Promise.all([
    detectDuplicateInvoice({ organizationId, vendor, total, date, excludeDocumentId: documentId }),
    suggestProjectForVendor({ organizationId, vendor }),
  ]);

  const paymentTerms = extractPaymentTerms(summary, date);

  return { duplicate, vendorProject, paymentTerms };
}

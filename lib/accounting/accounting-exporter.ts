/**
 * Israeli Accounting Software Export — Abstract Interface
 *
 * Provides a unified export contract for local Israeli accounting software:
 * - Priority (מ.א.ה / פריוריטי)
 * - חשבשבת (Hashavshevet)
 * - Generic BKMVDATA (מבנה אחיד — Israeli tax authority standard)
 *
 * Phase 4.2 — Local Moat Infrastructure
 */

// ── Data types (source from our DB models) ──────────────────────────────────

export type AccountingDocument = {
  /** IssuedDocument.id */
  id: string;
  docType: "INVOICE" | "RECEIPT" | "QUOTE" | "CREDIT_NOTE" | "DELIVERY_NOTE";
  docNumber: string | null;
  date: Date | null;
  dueDate?: Date | null;
  total: number;
  vatAmount?: number | null;
  currency: string;
  customerName: string;
  customerTaxId?: string | null;
  customerAddress?: string | null;
  lineItems: AccountingLineItem[];
  notes?: string | null;
};

export type AccountingLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  unit?: string | null;
  vatRate?: number | null;
};

export type AccountingExpense = {
  id: string;
  date: Date | null;
  vendorName: string;
  vendorTaxId?: string | null;
  total: number;
  vatAmount?: number | null;
  description?: string | null;
  category?: string | null;
};

export type AccountingExportRequest = {
  organizationId: string;
  organizationName: string;
  organizationTaxId?: string | null;
  fromDate: Date;
  toDate: Date;
  documents?: AccountingDocument[];
  expenses?: AccountingExpense[];
};

export type AccountingExportResult = {
  fileName: string;
  mimeType: string;
  /** Raw export bytes (CSV, XML, or binary format depending on target) */
  content: Buffer;
  /** Summary of exported records */
  summary: {
    documentCount: number;
    expenseCount: number;
    totalRevenue: number;
    totalExpenses: number;
  };
};

// ── Abstract base ────────────────────────────────────────────────────────────

export abstract class AccountingExporter {
  abstract readonly systemName: string;
  abstract readonly fileExtension: string;
  abstract readonly mimeType: string;

  /**
   * Export documents and/or expenses into the target accounting format.
   * Throws on critical format errors; returns structured result otherwise.
   */
  abstract export(request: AccountingExportRequest): Promise<AccountingExportResult>;

  protected buildSummary(request: AccountingExportRequest): AccountingExportResult["summary"] {
    return {
      documentCount: request.documents?.length ?? 0,
      expenseCount: request.expenses?.length ?? 0,
      totalRevenue: (request.documents ?? []).reduce((s, d) => s + d.total, 0),
      totalExpenses: (request.expenses ?? []).reduce((s, e) => s + e.total, 0),
    };
  }
}

// ── Registry ────────────────────────────────────────────────────────────────

const exporters = new Map<string, AccountingExporter>();

export function registerAccountingExporter(exporter: AccountingExporter): void {
  exporters.set(exporter.systemName, exporter);
}

export function getAccountingExporter(systemName: string): AccountingExporter {
  const exp = exporters.get(systemName);
  if (!exp) throw new Error(`Accounting exporter "${systemName}" is not registered.`);
  return exp;
}

export function getAvailableExporters(): string[] {
  return Array.from(exporters.keys());
}

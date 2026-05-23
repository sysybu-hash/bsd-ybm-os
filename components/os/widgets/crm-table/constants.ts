import type { IssuedDocumentRow } from "./types";

export const DOC_TYPE_LABELS: Record<string, string> = {
  QUOTE: "הצעת מחיר",
  TRANSACTION_INVOICE: "חשבונית עסקה",
  INVOICE: "חשבונית",
  INVOICE_RECEIPT: "חשבונית מס קבלה",
  RECEIPT: "קבלה",
  CREDIT_NOTE: "זיכוי",
};

export const DOC_STATUS_LABELS: Record<string, string> = {
  PENDING: "ממתין",
  PAID: "שולם",
  CANCELLED: "בוטל",
};

export function mapIssuedDocuments(raw: unknown): IssuedDocumentRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const d = entry as Record<string, unknown>;
    return {
      id: String(d.id),
      type: String(d.type ?? ""),
      number: Number(d.number) || 0,
      clientName: String(d.clientName ?? ""),
      total: Number(d.total) || 0,
      status: String(d.status ?? "PENDING"),
      date: String(d.date ?? d.createdAt ?? ""),
      items: d.items,
    };
  });
}

export function issuedDocumentDescription(doc: IssuedDocumentRow): string {
  const items = Array.isArray(doc.items) ? doc.items : [];
  const first = items[0] as { desc?: string; description?: string } | undefined;
  const lineDesc = first?.desc ?? first?.description;
  if (lineDesc && String(lineDesc).trim()) return String(lineDesc).trim();
  const typeLabel = DOC_TYPE_LABELS[doc.type] ?? doc.type;
  return doc.number > 0 ? `${typeLabel} #${doc.number}` : typeLabel;
}

export function issuedDocumentStatusClass(status: string): string {
  if (status === "PAID") return "bg-emerald-500/10 text-emerald-500";
  if (status === "CANCELLED") return "bg-slate-500/10 text-slate-500";
  return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
}

import type { IssuedDocumentRow } from "./types";
import type { WidgetType } from "@/hooks/use-window-manager";
import {
  CRM_PIPELINE_STATUSES,
  type CrmPipelineStatus,
} from "@/lib/crm/pipeline-status";

const DOC_TYPE_KEYS: Record<string, string> = {
  QUOTE: "workspaceWidgets.crmTable.docTypes.quote",
  TRANSACTION_INVOICE: "workspaceWidgets.crmTable.docTypes.transactionInvoice",
  INVOICE: "workspaceWidgets.crmTable.docTypes.invoice",
  INVOICE_RECEIPT: "workspaceWidgets.crmTable.docTypes.invoiceReceipt",
  RECEIPT: "workspaceWidgets.crmTable.docTypes.receipt",
  CREDIT_NOTE: "workspaceWidgets.crmTable.docTypes.creditNote",
};

const DOC_STATUS_KEYS: Record<string, string> = {
  PENDING: "workspaceWidgets.crmTable.docStatuses.pending",
  PAID: "workspaceWidgets.crmTable.docStatuses.paid",
  CANCELLED: "workspaceWidgets.crmTable.docStatuses.cancelled",
};

export function docTypeLabel(type: string, t: (key: string) => string): string {
  const key = DOC_TYPE_KEYS[type];
  return key ? t(key) : type;
}

export function docStatusLabel(status: string, t: (key: string) => string): string {
  const key = DOC_STATUS_KEYS[status];
  return key ? t(key) : status;
}

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

export function issuedDocumentDescription(doc: IssuedDocumentRow, t: (key: string) => string): string {
  const items = Array.isArray(doc.items) ? doc.items : [];
  const first = items[0] as { desc?: string; description?: string } | undefined;
  const lineDesc = first?.desc ?? first?.description;
  if (lineDesc && String(lineDesc).trim()) return String(lineDesc).trim();
  const typeLabel = docTypeLabel(doc.type, t);
  return doc.number > 0 ? `${typeLabel} #${doc.number}` : typeLabel;
}

export function issuedDocumentStatusClass(status: string): string {
  if (status === "PAID") return "bg-emerald-500/10 text-emerald-500";
  if (status === "CANCELLED") return "bg-slate-500/10 text-slate-500";
  return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
}

export const PIPELINE_STATUS_CLASS: Record<CrmPipelineStatus, string> = {
  LEAD: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  QUALIFIED: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  PROPOSAL: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  WON: "bg-emerald-500/10 text-[color:var(--accent)] dark:text-emerald-400",
  LOST: "bg-[color:var(--foreground-muted)]/10 text-[color:var(--foreground-muted)]",
};

export function pipelineStatusLabel(status: CrmPipelineStatus, t: (key: string) => string): string {
  return t(`workspaceWidgets.crmTable.pipeline.${status.toLowerCase()}`);
}

export function pipelineStatusOptions(t: (key: string) => string): { value: CrmPipelineStatus; label: string }[] {
  return CRM_PIPELINE_STATUSES.map((value) => ({
    value,
    label: pipelineStatusLabel(value, t),
  }));
}

export function openQuoteCreatorForContact(
  openWorkspaceWidget: ((type: WidgetType, data?: Record<string, unknown> | null) => void) | undefined,
  contact: { id: string; name: string },
): void {
  if (!openWorkspaceWidget) return;
  openWorkspaceWidget("documentsHub", {
    tab: "create",
    automation: "invoice_draft",
    docType: "QUOTE",
    contactId: contact.id,
    contactName: contact.name,
  });
}

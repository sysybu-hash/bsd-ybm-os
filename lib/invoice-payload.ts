import type { DocType, IssuedDocument, Organization } from "@prisma/client";
import type { InvoiceExportPayload, InvoiceLineItem } from "@/lib/invoice-export-types";
import { documentTypeLabel } from "@/lib/document-types";
import { resolveVatRatePercent } from "@/lib/vat-config";

export function parseInvoiceLineItems(items: unknown): InvoiceLineItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((row) => {
      const r = row as { desc?: string; qty?: number; price?: number };
      return {
        desc: String(r.desc ?? ""),
        qty: Number(r.qty) || 0,
        price: Number(r.price) || 0,
      };
    })
    .filter((i) => i.desc);
}

export function buildInvoiceExportPayload(
  doc: Pick<
    IssuedDocument,
    | "type"
    | "number"
    | "date"
    | "dueDate"
    | "clientName"
    | "amount"
    | "vat"
    | "total"
    | "items"
    | "itaAllocationNumber"
  >,
  org: Pick<Organization, "name" | "taxId" | "vatRatePercent" | "address"> & {
    paypalMerchantEmail?: string | null;
  },
): InvoiceExportPayload {
  const branding = org as { tenantSiteBrandingJson?: unknown };
  const email =
    typeof org.paypalMerchantEmail === "string" ? org.paypalMerchantEmail : undefined;

  return {
    type: doc.type,
    number: doc.number,
    clientName: doc.clientName,
    date: new Date(doc.date).toLocaleDateString("he-IL"),
    dueDate: doc.dueDate ? new Date(doc.dueDate).toLocaleDateString("he-IL") : undefined,
    amount: doc.amount,
    vat: doc.vat,
    total: doc.total,
    vatRatePercent: resolveVatRatePercent(org.vatRatePercent),
    items: parseInvoiceLineItems(doc.items),
    orgName: org.name,
    orgTaxId: org.taxId ?? undefined,
    orgEmail: email,
    orgAddress: org.address ?? undefined,
    itaAllocationNumber: doc.itaAllocationNumber,
    paymentNote: documentTypeLabel(doc.type),
  };
}

export function previewPayloadFromDraft(params: {
  type: DocType;
  number?: number;
  clientName: string;
  items: InvoiceLineItem[];
  net: number;
  vat: number;
  total: number;
  vatRatePercent: number;
  orgName: string;
  orgTaxId?: string;
  dueDate?: string;
}): InvoiceExportPayload {
  return {
    type: params.type,
    number: params.number ?? 0,
    clientName: params.clientName,
    date: new Date().toLocaleDateString("he-IL"),
    dueDate: params.dueDate,
    amount: params.net,
    vat: params.vat,
    total: params.total,
    vatRatePercent: params.vatRatePercent,
    items: params.items,
    orgName: params.orgName,
    orgTaxId: params.orgTaxId,
  };
}

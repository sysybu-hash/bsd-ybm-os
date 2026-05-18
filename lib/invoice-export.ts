import type { InvoiceExportPayload } from "@/lib/invoice-export-types";
import { buildInvoicePrintHtml } from "@/lib/pdf/invoice-print-html";
import { renderInvoicePdfChromium } from "@/lib/pdf/render-invoice-pdf-chromium";

export type { InvoiceExportPayload, InvoiceLineItem } from "@/lib/invoice-export-types";

/** PDF מעוצב בעברית RTL — HTML + Chromium (אמין ב-Vercel) */
export async function buildInvoicePdfBuffer(payload: InvoiceExportPayload): Promise<Uint8Array> {
  return renderInvoicePdfChromium(payload);
}

/** Word — אותה תבנית כמו PDF, עם פונט מערכת */
export function buildInvoiceDocxHtml(payload: InvoiceExportPayload): string {
  return buildInvoicePrintHtml(payload, "word");
}

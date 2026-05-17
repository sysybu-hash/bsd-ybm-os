import { renderToBuffer } from "@react-pdf/renderer";
import type { InvoiceExportPayload } from "@/lib/invoice-export-types";
import InvoiceDocument from "@/lib/pdf/InvoiceDocument";
import { registerHebrewPdfFont } from "@/lib/pdf/hebrew-font-register";

/** ייצוא PDF עברי RTL — מקור אמת אחד לחשבוניות (react-pdf, ללא reverseHebrew). */
export async function renderHebrewInvoicePdf(payload: InvoiceExportPayload): Promise<Uint8Array> {
  registerHebrewPdfFont();
  const buffer = await renderToBuffer(<InvoiceDocument payload={payload} />);
  return new Uint8Array(buffer);
}

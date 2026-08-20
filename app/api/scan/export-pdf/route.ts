import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { buildInvoicePdfBuffer } from "@/lib/invoice-export";
import type { InvoiceExportPayload } from "@/lib/invoice-export-types";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import { applyRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const POST = withWorkspacesAuth(async (req) => {
  const limited = await applyRateLimit(req, "scan:export-pdf", 10, 60_000);
  if (limited) return limited;

  const { v5 } = await req.json() as { v5: ScanExtractionV5 };

  const payload: InvoiceExportPayload = {
    type: v5.docType || "מסמך",
    number: 0,
    clientName: v5.documentMetadata.client ?? "",
    date: v5.date ?? new Date().toISOString().split("T")[0]!,
    amount: v5.total,
    vat: 0,
    total: v5.total,
    vatRatePercent: 0,
    items: v5.lineItems.map((li) => ({
      desc: li.description,
      qty: li.quantity ?? 1,
      price: li.unitPrice ?? li.lineTotal ?? 0,
    })),
    orgName: v5.vendor,
    orgTaxId: v5.taxId ?? undefined,
  };

  const buffer = await buildInvoicePdfBuffer(payload);
  const safeName = `${v5.vendor || "scan"}-${v5.date || "export"}.pdf`.replace(/[^\wא-ת._-]/g, "_");

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    },
  });
});

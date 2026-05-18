import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonBadRequest, jsonNotFound } from "@/lib/api-json";
import { buildInvoiceDocxHtml, buildInvoicePdfBuffer } from "@/lib/invoice-export";
import { buildInvoiceExportPayload } from "@/lib/invoice-payload";
import { captureServerEvent } from "@/lib/analytics/posthog-server";

export const runtime = "nodejs";
export const maxDuration = 90;

export const GET = withWorkspacesAuthDynamic<{ id: string }>(
  async (req, { orgId, userId }, segment) => {
    const { id } = await segment.params;
    if (!id) return jsonNotFound("מסמך לא נמצא");

    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") ?? "pdf").toLowerCase();
    if (format !== "pdf" && format !== "docx") {
      return jsonBadRequest("format חייב להיות pdf או docx", "invalid_format");
    }

    const doc = await prisma.issuedDocument.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!doc) return jsonNotFound("מסמך לא נמצא");

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        taxId: true,
        vatRatePercent: true,
        address: true,
        paypalMerchantEmail: true,
        companyType: true,
        isReportable: true,
      },
    });
    if (!org) return jsonNotFound("ארגון לא נמצא");

    const payload = buildInvoiceExportPayload(doc, org);

    const safeName = `bsd-ybm-${doc.type}-${doc.number}`;

    if (format === "docx") {
      const html = buildInvoiceDocxHtml(payload);
      return new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "application/msword; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeName}.doc"`,
        },
      });
    }

    let buffer: Uint8Array;
    try {
      buffer = await buildInvoicePdfBuffer(payload);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[invoice-export] PDF render failed:", detail, err);
      return NextResponse.json(
        {
          error: "יצירת קובץ PDF נכשלה. נסו שוב בעוד רגע.",
          code: "pdf_render_failed",
          ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
        },
        { status: 500 },
      );
    }
    captureServerEvent(userId, "invoice_exported", {
      documentId: id,
      format: "pdf",
      type: doc.type,
    });
    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  },
);

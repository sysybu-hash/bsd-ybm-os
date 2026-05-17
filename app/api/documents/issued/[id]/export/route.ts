import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonBadRequest, jsonNotFound } from "@/lib/api-json";
import {
  buildInvoiceDocxHtml,
  buildInvoicePdfBuffer,
  type InvoiceLineItem,
} from "@/lib/invoice-export";
import { captureServerEvent } from "@/lib/analytics/posthog-server";

function parseItems(items: unknown): InvoiceLineItem[] {
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
      select: { name: true, taxId: true },
    });

    const payload = {
      type: doc.type,
      number: doc.number,
      clientName: doc.clientName,
      date: new Date(doc.date).toLocaleDateString("he-IL"),
      amount: doc.amount,
      vat: doc.vat,
      total: doc.total,
      items: parseItems(doc.items),
      orgName: org?.name ?? undefined,
      orgTaxId: org?.taxId ?? undefined,
    };

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

    const buffer = await buildInvoicePdfBuffer(payload);
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
      },
    });
  },
);

import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { getAccountingExporter, getAvailableExporters } from "@/lib/accounting/accounting-exporter";
import type { AccountingDocument, AccountingExpense, AccountingLineItem } from "@/lib/accounting/accounting-exporter";
import { checkRateLimit } from "@/lib/rate-limit";
import { jsonTooManyRequests } from "@/lib/api-json";
// Self-register exporters
import "@/lib/accounting/bkmvdata-exporter";

export const dynamic = "force-dynamic";

const exportSchema = z.object({
  format: z.enum(["bkmvdata"]),
  fromDate: z.string().datetime(),
  toDate: z.string().datetime(),
  includeDocuments: z.boolean().default(true),
  includeExpenses: z.boolean().default(true),
});

/** List available export formats */
export const GET = withWorkspacesAuth(async (_req, { orgId }) => {
  return NextResponse.json({ formats: getAvailableExporters() });
});

/** Generate and download an accounting export */
export const POST = withWorkspacesAuth(
  async (_req, { orgId }, body) => {
    try {
      // 10 exports per hour per org
      const rl = await checkRateLimit(`accounting:export:${orgId}`, 10, 60 * 60 * 1000);
      if (!rl.success) return jsonTooManyRequests("הגבלת ייצוא — נסה שוב בעוד שעה", "rate_limited", { resetAt: rl.resetAt });

      const { format, fromDate, toDate, includeDocuments, includeExpenses } = body;

      const [org, issuedDocs, expenses] = await Promise.all([
        prisma.organization.findUnique({
          where: { id: orgId },
          select: { name: true },
        }),
        includeDocuments
          ? prisma.issuedDocument.findMany({
              where: {
                organizationId: orgId,
                date: { gte: new Date(fromDate), lte: new Date(toDate) },
                deletedAt: null,
              },
            })
          : Promise.resolve([]),
        includeExpenses
          ? prisma.expenseRecord.findMany({
              where: {
                organizationId: orgId,
                expenseDate: { gte: new Date(fromDate), lte: new Date(toDate) },
              },
            })
          : Promise.resolve([]),
      ]);

      if (!org) return jsonBadRequest("ארגון לא נמצא", "org_not_found");

      const documents: AccountingDocument[] = issuedDocs.map((doc) => {
        // items is stored as JSON: [{desc, qty, price}]
        type RawItem = { desc?: string; description?: string; qty?: number; quantity?: number; price?: number; unitPrice?: number; total?: number; lineTotal?: number; unit?: string };
        const rawItems = Array.isArray(doc.items) ? (doc.items as RawItem[]) : [];
        const lineItems: AccountingLineItem[] = rawItems.map((item) => ({
          description: item.desc ?? item.description ?? "",
          quantity: item.qty ?? item.quantity ?? 1,
          unitPrice: item.price ?? item.unitPrice ?? 0,
          lineTotal: item.total ?? item.lineTotal ?? 0,
          unit: item.unit ?? null,
        }));

        return {
          id: doc.id,
          docType: doc.type as AccountingDocument["docType"],
          docNumber: String(doc.number),
          date: doc.date,
          dueDate: doc.dueDate ?? null,
          total: doc.total,
          vatAmount: doc.vat,
          currency: "ILS",
          customerName: doc.clientName,
          customerTaxId: null,
          lineItems,
        };
      });

      const expenseRecords: AccountingExpense[] = expenses.map((e) => ({
        id: e.id,
        date: e.expenseDate,
        vendorName: e.vendorName,
        total: e.total,
        vatAmount: e.vat,
        description: e.description ?? null,
      }));

      const exporter = getAccountingExporter(format);
      const result = await exporter.export({
        organizationId: orgId,
        organizationName: org.name,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        documents,
        expenses: expenseRecords,
      });

      return new NextResponse(result.content as unknown as BodyInit, {
        headers: {
          "Content-Type": result.mimeType,
          "Content-Disposition": `attachment; filename="${result.fileName}"`,
          "X-Export-Documents": String(result.summary.documentCount),
          "X-Export-Expenses": String(result.summary.expenseCount),
        },
      });
    } catch (error) {
      return apiErrorResponse(error, "accounting-export");
    }
  },
  { schema: exportSchema },
);

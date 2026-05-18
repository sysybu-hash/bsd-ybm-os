import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonNotFound } from "@/lib/api-json";
import { resolveExportTotals } from "@/lib/invoice-payload";

export const GET = withWorkspacesAuthDynamic<{ id: string }>(
  async (_req, { orgId }, segment) => {
    const { id } = await segment.params;
    if (!id) return jsonNotFound("מסמך לא נמצא");

    const doc = await prisma.issuedDocument.findFirst({
      where: { id, organizationId: orgId },
      include: {
        project: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!doc) return jsonNotFound("מסמך לא נמצא");

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { companyType: true, isReportable: true, vatRatePercent: true },
    });
    if (!org) return jsonNotFound("ארגון לא נמצא");

    const totals = resolveExportTotals(doc, org);
    const needsSync =
      totals.amount !== doc.amount || totals.vat !== doc.vat || totals.total !== doc.total;

    if (needsSync) {
      await prisma.issuedDocument.update({
        where: { id: doc.id },
        data: { amount: totals.amount, vat: totals.vat, total: totals.total },
      });
    }

    return NextResponse.json({
      document: {
        ...doc,
        amount: totals.amount,
        vat: totals.vat,
        total: totals.total,
      },
    });
  },
);

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import FinanceReportDocument from "@/lib/pdf/FinanceReportDocument";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { loadFinanceForecast } from "@/lib/finance-forecast";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-route-helpers";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (_req, { orgId }) => {
  try {
    const [org, pendingAgg, paidAgg, forecast] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true },
      }),
      prisma.issuedDocument.aggregate({
        where: { organizationId: orgId, status: "PENDING" },
        _sum: { total: true },
        _count: true,
      }),
      prisma.issuedDocument.aggregate({
        where: { organizationId: orgId, status: "PAID" },
        _sum: { total: true },
      }),
      loadFinanceForecast(orgId),
    ]);

    const generatedAt = new Date().toLocaleString("he-IL");

    const buffer = await renderToBuffer(
      <FinanceReportDocument
        organizationName={org?.name ?? "ארגון"}
        generatedAt={generatedAt}
        actual={forecast.actual}
        pending={forecast.pending}
        forecast={forecast.forecast}
        totalProjected={forecast.totalProjected}
        pendingDocCount={pendingAgg._count}
        paidIssuedTotal={paidAgg._sum.total ?? 0}
      />,
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="bsd-ybm-finance-${orgId.slice(0, 8)}.pdf"`,
      },
    });
  } catch (err: unknown) {
    return apiErrorResponse(err, "api/reports/finance-pdf");
  }
});

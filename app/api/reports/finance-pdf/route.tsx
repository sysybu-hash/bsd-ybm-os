import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { renderToBuffer } from "@react-pdf/renderer";
import FinanceReportDocument from "@/lib/pdf/FinanceReportDocument";
import { authOptions } from "@/lib/auth";
import { jsonUnauthorized } from "@/lib/api-json";
import { loadFinanceForecast } from "@/lib/finance-forecast";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const organizationId = session?.user?.organizationId;
  if (!organizationId) {
    return jsonUnauthorized();
  }

  const [org, pendingAgg, paidAgg, forecast] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
    prisma.issuedDocument.aggregate({
      where: { organizationId, status: "PENDING" },
      _sum: { total: true },
      _count: true,
    }),
    prisma.issuedDocument.aggregate({
      where: { organizationId, status: "PAID" },
      _sum: { total: true },
    }),
    loadFinanceForecast(organizationId),
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
      "Content-Disposition": `attachment; filename="bsd-ybm-finance-${organizationId.slice(0, 8)}.pdf"`,
    },
  });
}

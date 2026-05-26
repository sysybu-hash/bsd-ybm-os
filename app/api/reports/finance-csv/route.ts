import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { csvEscape } from "@/lib/csv-escape";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "reports:finance-csv", 10, 60_000);
  if (limited) return limited;

  try {
    const rows = await prisma.issuedDocument.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        number: true,
        type: true,
        clientName: true,
        total: true,
        status: true,
        date: true,
        dueDate: true,
      },
    });

    const header = ["number", "type", "clientName", "total", "status", "date", "dueDate"];
    const lines = [
      header.join(","),
      ...rows.map((r) =>
        [
          r.number,
          r.type,
          csvEscape(r.clientName),
          r.total,
          r.status,
          r.date.toISOString(),
          r.dueDate ? r.dueDate.toISOString() : "",
        ].join(","),
      ),
    ];

    const bom = "\uFEFF";
    const body = bom + lines.join("\n");

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="issued-documents-${orgId.slice(0, 8)}.csv"`,
      },
    });
  } catch (err: unknown) {
    return apiErrorResponse(err, "api/reports/finance-csv");
  }
});

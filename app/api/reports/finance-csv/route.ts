import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-route-helpers";

export const dynamic = "force-dynamic";

function csvEscape(value: string | number) {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const GET = withWorkspacesAuth(async (_req, { orgId }) => {
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

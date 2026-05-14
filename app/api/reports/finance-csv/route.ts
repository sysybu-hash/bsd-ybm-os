import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonUnauthorized } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function csvEscape(value: string | number) {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const organizationId = session?.user?.organizationId;
  if (!organizationId) {
    return jsonUnauthorized();
  }

  const rows = await prisma.issuedDocument.findMany({
    where: { organizationId },
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
      "Content-Disposition": `attachment; filename="issued-documents-${organizationId.slice(0, 8)}.csv"`,
    },
  });
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { csvRow } from "@/lib/csv-escape";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "crm:contacts-export", 10, 60_000);
  if (limited) return limited;

  try {
    const contacts = await prisma.contact.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        name: true,
        email: true,
        phone: true,
        status: true,
        notes: true,
        tags: true,
        createdAt: true,
        project: { select: { name: true } },
      },
    });

    const header = ["name", "email", "phone", "status", "project", "tags", "notes", "createdAt"];
    const lines = [
      header.join(","),
      ...contacts.map((c) =>
        csvRow([
          c.name,
          c.email,
          c.phone,
          c.status,
          c.project?.name ?? "",
          (c.tags ?? []).join("|"),
          c.notes,
          c.createdAt.toISOString(),
        ]),
      ),
    ];

    const bom = "\uFEFF";
    const body = bom + lines.join("\n");

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="crm-contacts-${orgId.slice(0, 8)}.csv"`,
      },
    });
  } catch (err: unknown) {
    return apiErrorResponse(err, "api/crm/contacts/export");
  }
});

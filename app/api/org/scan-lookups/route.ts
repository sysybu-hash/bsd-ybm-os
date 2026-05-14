import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuth } from "@/lib/api-handler";

/**
 * GET /api/org/scan-lookups?q=&contactProjectId=
 * פרויקטים (מלא עד 500) + לקוחות מסוננים: `q` — שם לקוח, `contactProjectId` — לקוחות בפרויקט + ללא פרויקט.
 */
export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const contactProjectId = searchParams.get("contactProjectId")?.trim() ?? "";

  const contactWhere: Prisma.ContactWhereInput = { organizationId: orgId };
  if (q) {
    contactWhere.name = { contains: q, mode: "insensitive" };
  }
  if (contactProjectId) {
    contactWhere.OR = [{ projectId: contactProjectId }, { projectId: null }];
  }

  const [projects, contacts] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId: orgId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      take: 500,
      select: { id: true, name: true, isActive: true },
    }),
    prisma.contact.findMany({
      where: contactWhere,
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, name: true, projectId: true },
    }),
  ]);

  return NextResponse.json({ projects, contacts });
});

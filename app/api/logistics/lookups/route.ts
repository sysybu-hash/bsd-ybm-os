import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/logistics/lookups — משתמשי ארגון ופרויקטים לטפסי החתמה */
export const GET = withWorkspacesAuth(async (_req, { orgId }) => {
  const [users, projects] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: orgId, accountStatus: "ACTIVE" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.project.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  return NextResponse.json({ users, projects });
});

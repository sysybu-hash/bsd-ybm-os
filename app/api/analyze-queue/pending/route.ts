import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** מספר משימות סריקה ממתינות/פעילות למשתמש */
export const GET = withWorkspacesAuth(async (_req, { userId, orgId }) => {
  const pending = await prisma.documentScanJob.count({
    where: {
      userId,
      organizationId: orgId,
      status: { in: ["PENDING", "PROCESSING"] },
    },
  });
  return NextResponse.json({ pending });
});

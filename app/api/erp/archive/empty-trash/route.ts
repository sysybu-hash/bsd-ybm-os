import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** מחיקה לצמיתות של כל המסמכים בפח האשפה בארגון */
export const POST = withWorkspacesAuth(async (req, { orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "erp:archive-empty-trash", 5, 60_000);
  if (limited) return limited;

  try {
    const [documents, issued] = await prisma.$transaction([
      prisma.document.deleteMany({
        where: { organizationId: orgId, deletedAt: { not: null } },
      }),
      prisma.issuedDocument.deleteMany({
        where: { organizationId: orgId, deletedAt: { not: null } },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      purgedDocuments: documents.count,
      purgedIssued: issued.count,
      total: documents.count + issued.count,
    });
  } catch (err: unknown) {
    return apiErrorResponse(err, "api/erp/archive/empty-trash");
  }
});

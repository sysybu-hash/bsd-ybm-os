import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuth } from "@/lib/api-handler";
import type { Document } from "@prisma/client";

/** חיפוש מסמכי ERP (ארכיון חכם) – פרמטר `q` */
export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    const docs = await prisma.document.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ documents: docs });
  }

  const pattern = `%${q}%`;
  const docs = await prisma.$queryRaw<Document[]>`
    SELECT * FROM "Document"
    WHERE "organizationId" = ${orgId}
    AND (
      "fileName" ILIKE ${pattern}
      OR "type" ILIKE ${pattern}
      OR COALESCE("aiData"::text, '') ILIKE ${pattern}
    )
    ORDER BY "createdAt" DESC
  `;

  return NextResponse.json({ documents: docs, q });
});

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonNotFound } from "@/lib/api-json";

export const GET = withWorkspacesAuthDynamic<{ id: string }>(
  async (_req, { orgId }, segment) => {
    const { id } = await segment.params;
    if (!id) return jsonNotFound("מסמך לא נמצא");

    const doc = await prisma.issuedDocument.findFirst({
      where: { id, organizationId: orgId },
      include: {
        project: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
      },
    });

    if (!doc) return jsonNotFound("מסמך לא נמצא");
    return NextResponse.json({ document: doc });
  },
);

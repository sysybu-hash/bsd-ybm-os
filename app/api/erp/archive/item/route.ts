import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest, jsonNotFound } from "@/lib/api-json";

const archiveItemActionSchema = z.object({
  source: z.enum(["issued", "document"]),
  sourceId: z.string().trim().min(1),
  action: z.enum(["trash", "restore", "purge"]),
});

/** פעולות ארכיון: העברה לפח / שחזור / מחיקה לצמיתות */
export const PATCH = withWorkspacesAuth(
  async (_req, { orgId }, data) => {
    const { source, sourceId, action } = data as z.infer<typeof archiveItemActionSchema>;

    if (source === "issued") {
      const row = await prisma.issuedDocument.findFirst({
        where: { id: sourceId, organizationId: orgId },
        select: { id: true, deletedAt: true },
      });
      if (!row) return jsonNotFound("מסמך לא נמצא");

      if (action === "trash") {
        await prisma.issuedDocument.update({
          where: { id: sourceId },
          data: { deletedAt: new Date() },
        });
      } else if (action === "restore") {
        await prisma.issuedDocument.update({
          where: { id: sourceId },
          data: { deletedAt: null },
        });
      } else {
        await prisma.issuedDocument.delete({ where: { id: sourceId } });
      }
    } else {
      const row = await prisma.document.findFirst({
        where: { id: sourceId, organizationId: orgId },
        select: { id: true, deletedAt: true },
      });
      if (!row) return jsonNotFound("מסמך לא נמצא");

      if (action === "trash") {
        await prisma.document.update({
          where: { id: sourceId },
          data: { deletedAt: new Date() },
        });
      } else if (action === "restore") {
        await prisma.document.update({
          where: { id: sourceId },
          data: { deletedAt: null },
        });
      } else {
        await prisma.document.delete({ where: { id: sourceId } });
      }
    }

    return NextResponse.json({ ok: true, action });
  },
  { schema: archiveItemActionSchema },
);

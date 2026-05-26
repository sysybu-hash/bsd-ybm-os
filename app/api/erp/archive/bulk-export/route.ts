import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { buildArchiveBulkZip, parseBulkExportItems } from "@/lib/erp-archive-bulk-export";
import { mapDocumentToArchive, mapIssuedToArchive } from "@/lib/erp-archive";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const bulkExportSchema = z.object({
  items: z
    .array(
      z.object({
        source: z.enum(["issued", "document"]),
        sourceId: z.string().min(1),
      }),
    )
    .min(1)
    .max(50),
});

export const POST = withWorkspacesAuth(
  async (req, { orgId }, data) => {
    const limited = await applyRateLimit(req as NextRequest, "erp:archive-bulk-export", 5, 60_000);
    if (limited) return limited;

    try {
      const { items: requested } = data as z.infer<typeof bulkExportSchema>;

      const issuedIds = requested.filter((i) => i.source === "issued").map((i) => i.sourceId);
      const documentIds = requested.filter((i) => i.source === "document").map((i) => i.sourceId);

      const [issuedRows, documentRows] = await Promise.all([
        issuedIds.length
          ? prisma.issuedDocument.findMany({
              where: { organizationId: orgId, id: { in: issuedIds }, deletedAt: null },
              include: { project: { select: { id: true, name: true } }, createdByUser: { select: { name: true, email: true } } },
            })
          : [],
        documentIds.length
          ? prisma.document.findMany({
              where: { organizationId: orgId, id: { in: documentIds }, deletedAt: null },
              include: { user: { select: { name: true, email: true } } },
            })
          : [],
      ]);

      const allowedFiles = [
        ...issuedRows.map((r) => mapIssuedToArchive(r)),
        ...documentRows.map((r) => mapDocumentToArchive(r)),
      ];

      const items = parseBulkExportItems(requested, allowedFiles);
      if (items.length === 0) return jsonBadRequest("לא נמצאו מסמכים לייצוא", "no_items");

      const zipBuffer = await buildArchiveBulkZip(orgId, items);
      const stamp = new Date().toISOString().slice(0, 10);

      return new NextResponse(new Uint8Array(zipBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="erp-archive-${stamp}.zip"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "TOO_MANY_ITEMS" || msg === "NO_ITEMS") {
        return jsonBadRequest("מגבלת ייצוא: עד 50 קבצים", "limit");
      }
      return apiErrorResponse(err, "api/erp/archive/bulk-export");
    }
  },
  { schema: bulkExportSchema },
);

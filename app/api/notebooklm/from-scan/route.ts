import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest, jsonNotFound } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { buildNotebookSourcesFromScan } from "@/lib/notebooklm-from-scan";
import { saveNotebookForUser } from "@/lib/notebooklm-db";
import { prisma } from "@/lib/prisma";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";

export const dynamic = "force-dynamic";

const fromScanBodySchema = z.object({
  fileName: z.string().min(1),
  v5: z.unknown(),
  telemetry: z.unknown().nullable().optional(),
  extractedText: z.string().nullable().optional(),
  title: z.string().optional(),
  notebookId: z.string().optional(),
  projectId: z.string().nullable().optional(),
});

export const POST = withWorkspacesAuth(
  async (_req, { userId, orgId }, data) => {
    try {
      const fileName = data.fileName.trim();
      const v5 = data.v5 as ScanExtractionV5;
      if (!v5) return jsonBadRequest("Missing scan payload", "missing_scan");

      const title = (data.title?.trim() || `סריקה — ${fileName}`).slice(0, 200);
      const sources = buildNotebookSourcesFromScan({
        fileName,
        v5,
        telemetry: (data.telemetry as TriEngineTelemetry | null) ?? null,
        extractedText: data.extractedText ?? null,
      });

      const intro =
        "נשמרו מקור הסריקה והפענוח. אפשר לשאול על סכומים, ספק, שורות או לבקש סיכום.";

      if (data.notebookId) {
        const existing = await prisma.notebook.findFirst({
          where: { id: data.notebookId, userId },
        });
        if (!existing) return jsonNotFound("המחברת לא נמצאה.", "notebook_not_found");

        const last = await prisma.notebookSource.findFirst({
          where: { notebookId: existing.id },
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        });
        let order = (last?.sortOrder ?? -1) + 1;

        await prisma.$transaction([
          prisma.notebookSource.createMany({
            data: sources.map((s) => ({
              notebookId: existing.id,
              name: s.name,
              content: s.content,
              mimeType: s.mimeType ?? "text/plain",
              sortOrder: order++,
            })),
          }),
          prisma.notebookMessage.create({
            data: { notebookId: existing.id, role: "assistant", content: intro },
          }),
        ]);

        return Response.json({ notebookId: existing.id, title: existing.title });
      }

      const saved = await saveNotebookForUser(userId, orgId, {
        title,
        projectId: data.projectId ?? null,
        sources: sources.map((s, i) => ({
          name: s.name,
          content: s.content,
          mimeType: s.mimeType ?? "text/plain",
          sortOrder: i,
        })),
        messages: [{ role: "assistant", content: intro }],
      });

      if (!saved) {
        return Response.json({ error: "שמירה נכשלה" }, { status: 500 });
      }

      return Response.json({ notebookId: saved.id, title: saved.title });
    } catch (err) {
      return apiErrorResponse(err, "notebooklm/from-scan");
    }
  },
  { schema: fromScanBodySchema },
);

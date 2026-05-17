import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";
import {
  buildFolderListingMarkdown,
  extractTextForNotebook,
} from "@/lib/google-drive-file-content";
import { saveNotebookForUser } from "@/lib/notebooklm-db";
import { GoogleDriveService } from "@/lib/services/google-drive";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  notebookId: z.string().optional(),
});

export const POST = withWorkspacesAuth(
  async (_req, { userId, orgId }, body) => {
    try {
      const { fileId, fileName, mimeType, notebookId } = body;
      const drive = await GoogleDriveService.forUser(userId);
      const isFolder = mimeType === "application/vnd.google-apps.folder";

      const sources: Array<{ name: string; content: string; mimeType: string }> = [];

      if (isFolder) {
        const children = await drive.listFiles(fileId);
        sources.push({
          name: `תיקייה: ${fileName}`,
          content: buildFolderListingMarkdown(
            fileName,
            children.map((c) => ({
              name: c.name ?? "ללא שם",
              mimeType: c.mimeType ?? "application/octet-stream",
              webViewLink: c.webViewLink,
            })),
          ),
          mimeType: "text/markdown",
        });
        for (const child of children.slice(0, 8)) {
          if (!child.id || child.mimeType === "application/vnd.google-apps.folder") continue;
          try {
            const { buffer, mimeType: childMime, name } = await drive.downloadFileContent(
              child.id,
              child.name ?? "file",
              child.mimeType ?? "application/octet-stream",
            );
            const text = await extractTextForNotebook(buffer, name, childMime);
            if (text.trim()) {
              sources.push({
                name: `${fileName} / ${name}`,
                content: text,
                mimeType: "text/plain",
              });
            }
          } catch {
            /* דלג על קובץ שלא ניתן לחלץ */
          }
        }
      } else {
        const { buffer, mimeType: resolvedMime, name } = await drive.downloadFileContent(
          fileId,
          fileName,
          mimeType,
        );
        const text = await extractTextForNotebook(buffer, name, resolvedMime);
        if (!text.trim()) {
          return jsonBadRequest("לא נמצא תוכן טקסטואלי בקובץ", "empty_content");
        }
        sources.push({
          name: fileName,
          content: text,
          mimeType: resolvedMime.startsWith("application/pdf") ? "application/pdf" : "text/plain",
        });
      }

      const intro =
        isFolder
          ? `נוספה תיקיית Drive «${fileName}» למחברת (${sources.length} מקורות).`
          : `נוסף קובץ Drive «${fileName}» למחברת.`;

      if (notebookId) {
        const existing = await prisma.notebook.findFirst({
          where: { id: notebookId, userId },
        });
        if (!existing) {
          return Response.json({ error: "המחברת לא נמצאה" }, { status: 404 });
        }
        const last = await prisma.notebookSource.findFirst({
          where: { notebookId },
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        });
        let order = (last?.sortOrder ?? -1) + 1;
        await prisma.$transaction([
          prisma.notebookSource.createMany({
            data: sources.map((s) => ({
              notebookId,
              name: s.name,
              content: s.content,
              mimeType: s.mimeType,
              sortOrder: order++,
            })),
          }),
          prisma.notebookMessage.create({
            data: { notebookId, role: "assistant", content: intro },
          }),
        ]);
        return Response.json({
          notebookId,
          title: existing.title,
          preloadSources: sources.map((s) => ({
            name: s.name,
            content: s.content,
            type: s.mimeType.includes("pdf") ? "pdf" : "text",
          })),
        });
      }

      const title = isFolder ? `Drive — ${fileName}` : `Drive — ${fileName}`.slice(0, 200);
      const saved = await saveNotebookForUser(userId, orgId, {
        title,
        projectId: null,
        sources: sources.map((s, i) => ({
          name: s.name,
          content: s.content,
          mimeType: s.mimeType,
          sortOrder: i,
        })),
        messages: [{ role: "assistant", content: intro }],
      });

      if (!saved) {
        return Response.json({ error: "שמירה במחברת נכשלה" }, { status: 500 });
      }

      return Response.json({
        notebookId: saved.id,
        title: saved.title,
        preloadSources: sources.map((s) => ({
          name: s.name,
          content: s.content,
          type: s.mimeType.includes("pdf") ? "pdf" : "text",
        })),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return jsonBadRequest("נתונים לא תקינים", "invalid_body");
      }
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        (error.name === "GoogleOAuthNotLinkedError" || error.name === "GoogleOAuthRefreshError")
      ) {
        return googleDriveErrorResponse(error);
      }
      return apiErrorResponse(error, "google-drive/to-notebook");
    }
  },
  { schema: bodySchema },
);

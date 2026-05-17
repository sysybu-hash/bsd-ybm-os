import { z } from "zod";
import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";
import {
  decodeDriveFilePreview,
  finalizeDriveFileSave,
  saveDecodedDriveFile,
  type DriveDecodePreviewItem,
} from "@/lib/google-drive-decode-service";
import { getOrCreateGoogleDriveIntegration } from "@/lib/google-drive-org";

export const dynamic = "force-dynamic";

const previewBodySchema = z.object({
  mode: z.literal("preview"),
  fileIds: z.array(z.string().min(1)).min(1).max(20),
});

const saveItemSchema = z.object({
  driveFileId: z.string().min(1),
  fileName: z.string().min(1),
  targetModule: z.enum(["ERP", "CRM"]),
  contactId: z.string().optional(),
  aiData: z.record(z.string(), z.unknown()),
});

const saveBodySchema = z.object({
  mode: z.literal("save"),
  items: z.array(saveItemSchema).min(1).max(20),
});

const bodySchema = z.discriminatedUnion("mode", [previewBodySchema, saveBodySchema]);

export const POST = withWorkspacesAuth(
  async (_req, { userId, orgId }, body) => {
    try {
      if (body.mode === "preview") {
        const results: DriveDecodePreviewItem[] = [];
        const integration = await getOrCreateGoogleDriveIntegration(orgId);

        for (const driveFileId of body.fileIds) {
          const entry = await prisma.driveSyncEntry.findUnique({
            where: {
              organizationId_driveFileId: { organizationId: orgId, driveFileId },
            },
          });
          const name = entry?.name ?? "drive-file";
          const mimeType = entry?.mimeType ?? "application/octet-stream";

          const preview = await decodeDriveFilePreview(
            userId,
            orgId,
            driveFileId,
            name,
            mimeType,
          );
          results.push(preview);

          const canAutoSave =
            integration.driveAutoSaveAfterDecode &&
            !preview.needsReview &&
            preview.targetModule !== "REVIEW" &&
            preview.aiData &&
            (preview.targetModule === "ERP" || preview.targetModule === "CRM");

          if (
            canAutoSave &&
            (!integration.driveAskBeforeSave || preview.detectedClientName)
          ) {
            const saved = await saveDecodedDriveFile(
              preview.fileName,
              preview.aiData!,
              preview.targetModule as "ERP" | "CRM",
            );
            if (saved.ok) {
              await finalizeDriveFileSave(orgId, driveFileId, saved.documentId);
              preview.decodeStatus = "COMPLETED";
              preview.documentId = saved.documentId;
              preview.needsReview = false;
            }
          }
        }

        return NextResponse.json({ results });
      }

      const savedResults: Array<{
        driveFileId: string;
        ok: boolean;
        documentId?: string;
        error?: string;
      }> = [];

      for (const item of body.items) {
        const result = await saveDecodedDriveFile(
          item.fileName,
          item.aiData,
          item.targetModule,
          item.contactId,
        );
        if (result.ok) {
          await finalizeDriveFileSave(orgId, item.driveFileId, result.documentId);
        }
        savedResults.push({
          driveFileId: item.driveFileId,
          ok: result.ok,
          documentId: result.documentId,
          error: result.error,
        });
      }

      return NextResponse.json({ results: savedResults });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return jsonBadRequest("נתונים לא תקינים", "invalid_body");
      }
      return googleDriveErrorResponse(error);
    }
  },
  { schema: bodySchema },
);

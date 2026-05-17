import { z } from "zod";
import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import {
  ensureOrgDriveWorkspaceFolder,
  getOrCreateGoogleDriveIntegration,
  integrationToSettings,
} from "@/lib/google-drive-org";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";
import { DEFAULT_GOOGLE_DRIVE_FOLDER_NAME } from "@/lib/google-drive-config";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (_req, { orgId, userId }) => {
  try {
    const row = await getOrCreateGoogleDriveIntegration(orgId);
    let settings = integrationToSettings(row);

    if (!settings.driveFolderId) {
      try {
        const { folderId, folderName } = await ensureOrgDriveWorkspaceFolder(userId, orgId);
        settings = { ...settings, driveFolderId: folderId, driveFolderName: folderName };
      } catch {
        /* OAuth לא מחובר — מחזירים הגדרות בלבד */
      }
    }

    return NextResponse.json({ settings });
  } catch (error) {
    return googleDriveErrorResponse(error);
  }
});

const patchSchema = z.object({
  driveFolderName: z.string().min(1).max(120).optional(),
  driveSyncEnabled: z.boolean().optional(),
});

export const PATCH = withWorkspacesAuth(
  async (_req, { orgId, userId }, body) => {
    try {
      const integration = await getOrCreateGoogleDriveIntegration(orgId);
      const folderName =
        body.driveFolderName?.trim() || integration.driveFolderName || DEFAULT_GOOGLE_DRIVE_FOLDER_NAME;

      const data: {
        driveFolderName: string;
        driveSyncEnabled?: boolean;
        driveFolderId?: string | null;
        driveSyncCursor?: string | null;
      } = {
        driveFolderName: folderName,
      };

      if (typeof body.driveSyncEnabled === "boolean") {
        data.driveSyncEnabled = body.driveSyncEnabled;
      }

      const nameChanged =
        body.driveFolderName &&
        body.driveFolderName.trim() !== (integration.driveFolderName ?? DEFAULT_GOOGLE_DRIVE_FOLDER_NAME);

      if (nameChanged) {
        await prisma.cloudIntegration.update({
          where: { id: integration.id },
          data: { driveFolderId: null, driveSyncCursor: null },
        });
        const { folderId } = await ensureOrgDriveWorkspaceFolder(userId, orgId, folderName);
        data.driveFolderId = folderId;
        data.driveSyncCursor = null;
      }

      const updated = await prisma.cloudIntegration.update({
        where: { id: integration.id },
        data,
      });

      return NextResponse.json({ settings: integrationToSettings(updated) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return jsonBadRequest("נתונים לא תקינים", "invalid_body");
      }
      return googleDriveErrorResponse(error);
    }
  },
  { schema: patchSchema },
);

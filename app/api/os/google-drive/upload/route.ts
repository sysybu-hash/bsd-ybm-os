import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { ensureOrgDriveWorkspaceFolder } from "@/lib/google-drive-org";
import { GoogleDriveService } from "@/lib/services/google-drive";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";
import { prisma } from "@/lib/prisma";
import { syncGoogleDriveWorkspace } from "@/lib/google-drive-sync";

export const dynamic = "force-dynamic";

export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const folderIdParam = form.get("folderId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
    }

    const { folderId: workspaceId } = await ensureOrgDriveWorkspaceFolder(userId, orgId);
    const targetFolderId =
      typeof folderIdParam === "string" && folderIdParam.length > 0
        ? folderIdParam
        : workspaceId;

    const buffer = Buffer.from(await file.arrayBuffer());
    const drive = await GoogleDriveService.forUser(userId);
    const uploaded = await drive.uploadFile(
      file.name,
      file.type || "application/octet-stream",
      buffer,
      targetFolderId,
    );

    if (uploaded.id) {
      await prisma.driveSyncEntry.upsert({
        where: {
          organizationId_driveFileId: {
            organizationId: orgId,
            driveFileId: uploaded.id,
          },
        },
        create: {
          organizationId: orgId,
          driveFileId: uploaded.id,
          name: uploaded.name ?? file.name,
          mimeType: uploaded.mimeType ?? file.type,
          webViewLink: uploaded.webViewLink ?? null,
          modifiedTime: uploaded.modifiedTime ? new Date(uploaded.modifiedTime) : new Date(),
          parentDriveId: uploaded.parents?.[0] ?? targetFolderId,
          trashed: false,
        },
        update: {
          name: uploaded.name ?? file.name,
          mimeType: uploaded.mimeType ?? file.type,
          webViewLink: uploaded.webViewLink ?? null,
          modifiedTime: uploaded.modifiedTime ? new Date(uploaded.modifiedTime) : new Date(),
          trashed: false,
        },
      });
    }

    void syncGoogleDriveWorkspace(userId, orgId).catch(() => undefined);

    return NextResponse.json({ ok: true, file: uploaded });
  } catch (error) {
    return googleDriveErrorResponse(error);
  }
});

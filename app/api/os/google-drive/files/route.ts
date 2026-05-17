import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { ensureOrgDriveWorkspaceFolder } from "@/lib/google-drive-org";
import { GoogleDriveService } from "@/lib/services/google-drive";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (req, { userId, orgId }) => {
  try {
    const params = new URL(req.url).searchParams;
    const folderParam = params.get("folderId") || "workspace";
    const workspace = await ensureOrgDriveWorkspaceFolder(userId, orgId);

    const folderId =
      folderParam === "workspace" || folderParam === "root"
        ? workspace.folderId
        : folderParam;

    const driveService = await GoogleDriveService.forUser(userId);
    const files = await driveService.listFiles(folderId);

    const ids = files.map((f) => f.id).filter(Boolean) as string[];
    const dbRows =
      ids.length > 0
        ? await prisma.driveSyncEntry.findMany({
            where: { organizationId: orgId, driveFileId: { in: ids } },
            select: {
              driveFileId: true,
              modifiedTime: true,
              decodeStatus: true,
              decodeError: true,
              linkedDocumentId: true,
              lastDecodedAt: true,
              detectedClientName: true,
              detectedDocType: true,
            },
          })
        : [];
    const byId = new Map(dbRows.map((r) => [r.driveFileId, r]));

    const enriched = files.map((f) => {
      const row = f.id ? byId.get(f.id) : undefined;
      return {
        ...f,
        modifiedTime:
          row?.modifiedTime?.toISOString() ??
          (f.modifiedTime ? String(f.modifiedTime) : null),
        decodeStatus: row?.decodeStatus ?? null,
        decodeError: row?.decodeError ?? null,
        linkedDocumentId: row?.linkedDocumentId ?? null,
        lastDecodedAt: row?.lastDecodedAt?.toISOString() ?? null,
        detectedClientName: row?.detectedClientName ?? null,
        detectedDocType: row?.detectedDocType ?? null,
      };
    });

    return NextResponse.json({
      files: enriched,
      folderId,
      workspaceFolderName: workspace.folderName,
      workspaceFolderId: workspace.folderId,
    });
  } catch (error) {
    return googleDriveErrorResponse(error);
  }
});

import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { ensureOrgDriveWorkspaceFolder } from "@/lib/google-drive-org";
import { GoogleDriveService } from "@/lib/services/google-drive";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";

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

    return NextResponse.json({
      files,
      folderId,
      workspaceFolderName: workspace.folderName,
      workspaceFolderId: workspace.folderId,
    });
  } catch (error) {
    return googleDriveErrorResponse(error);
  }
});

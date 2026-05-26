import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { getOrCreateGoogleDriveIntegration } from "@/lib/google-drive-org";
import { DEFAULT_GOOGLE_DRIVE_FOLDER_NAME } from "@/lib/google-drive-config";
import { GoogleDriveService } from "@/lib/services/google-drive";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";

export const dynamic = "force-dynamic";

/** עם scope drive.file — רק תיקיית העבודה של הארגון, לא כל ה-Drive */
export const GET = withWorkspacesAuth(async (_req, { userId, orgId }) => {
  try {
    const integration = await getOrCreateGoogleDriveIntegration(orgId);
    const name =
      integration.driveFolderName?.trim() || DEFAULT_GOOGLE_DRIVE_FOLDER_NAME;

    if (integration.driveFolderId) {
      return NextResponse.json({
        folders: [{ id: integration.driveFolderId, name }],
      });
    }

    const drive = await GoogleDriveService.forUser(userId);
    const folder = await drive.ensureFolder(name, "root");
    if (folder.id) {
      return NextResponse.json({
        folders: [{ id: folder.id, name: folder.name ?? name }],
      });
    }

    return NextResponse.json({ folders: [] });
  } catch (error) {
    return googleDriveErrorResponse(error);
  }
});

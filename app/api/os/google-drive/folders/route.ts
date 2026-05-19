import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { GoogleDriveService } from "@/lib/services/google-drive";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (_req, { userId }) => {
  try {
    const drive = await GoogleDriveService.forUser(userId);
    const folders = await drive.listFolders();
    return NextResponse.json({
      folders: folders
        .filter((f) => f.id && f.name)
        .map((f) => ({ id: f.id, name: f.name, parents: f.parents ?? [] })),
    });
  } catch (error) {
    return googleDriveErrorResponse(error);
  }
});

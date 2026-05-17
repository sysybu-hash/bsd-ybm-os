import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import {
  ensureOrgDriveWorkspaceFolder,
  getOrCreateGoogleDriveIntegration,
  integrationToSettings,
} from "@/lib/google-drive-org";
import { syncGoogleDriveWorkspace } from "@/lib/google-drive-sync";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";

export const dynamic = "force-dynamic";

/** מבטיח תיקיית BSD-YBM (או שם מותאם) ומפעיל סנכרון ראשוני */
export const GET = withWorkspacesAuth(async (_req, { orgId, userId }) => {
  try {
    const integration = await getOrCreateGoogleDriveIntegration(orgId);
    const { folderId, folderName } = await ensureOrgDriveWorkspaceFolder(userId, orgId);

    let sync = null;
    if (integration.driveSyncEnabled) {
      sync = await syncGoogleDriveWorkspace(userId, orgId);
    }

    const row = await getOrCreateGoogleDriveIntegration(orgId);
    return NextResponse.json({
      settings: integrationToSettings(row),
      workspace: { folderId, folderName },
      sync,
    });
  } catch (error) {
    return googleDriveErrorResponse(error);
  }
});

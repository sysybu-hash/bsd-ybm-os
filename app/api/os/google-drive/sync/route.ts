import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { syncGoogleDriveWorkspace } from "@/lib/google-drive-sync";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";

export const dynamic = "force-dynamic";

export const POST = withWorkspacesAuth(async (_req, { orgId, userId }) => {
  try {
    const result = await syncGoogleDriveWorkspace(userId, orgId);
    return NextResponse.json(result);
  } catch (error) {
    return googleDriveErrorResponse(error);
  }
});

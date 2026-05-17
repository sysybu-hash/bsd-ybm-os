import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import {
  GoogleDriveService,
  GoogleOAuthNotLinkedError,
  GoogleOAuthRefreshError,
} from "@/lib/services/google-drive";
export const GET = withWorkspacesAuth(async (req, { userId }) => {
  try {
    const folderId = new URL(req.url).searchParams.get("folderId") || "root";
    const driveService = await GoogleDriveService.forUser(userId);
    const files = await driveService.listFiles(folderId);

    return NextResponse.json({ files });
  } catch (error: unknown) {
    if (error instanceof GoogleOAuthNotLinkedError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "google_not_linked",
          reauthUrl: "/api/auth/signin/google?callbackUrl=/",
        },
        { status: 401 },
      );
    }

    if (error instanceof GoogleOAuthRefreshError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "google_token_expired",
          reauthUrl: "/api/auth/signin/google?callbackUrl=/",
        },
        { status: 401 },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    const needsReauth =
      /invalid authentication credentials|invalid_grant|token has been expired|unauthorized/i.test(
        message,
      );

    return NextResponse.json(
      {
        error: needsReauth
          ? "נדרש חיבור מחדש ל-Google Drive. התנתקו והתחברו שוב עם Google."
          : message || "Failed to fetch files from Google Drive",
        code: needsReauth ? "google_reauth_required" : "drive_error",
        reauthUrl: needsReauth ? "/api/auth/signin/google?callbackUrl=/" : undefined,
      },
      { status: needsReauth ? 401 : 500 },
    );
  }
});

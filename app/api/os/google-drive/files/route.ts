import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  GoogleDriveService,
  GoogleOAuthNotLinkedError,
  GoogleOAuthRefreshError,
} from "@/lib/services/google-drive";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const folderId = req.nextUrl.searchParams.get("folderId") || "root";
    const driveService = await GoogleDriveService.forUser(session.user.id);
    const files = await driveService.listFiles(folderId);

    return NextResponse.json({ files });
  } catch (error: unknown) {
    console.error("[Google Drive API Error]:", error);

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
}

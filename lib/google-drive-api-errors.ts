import { NextResponse } from "next/server";
import {
  GoogleOAuthNotLinkedError,
  GoogleOAuthRefreshError,
} from "@/lib/services/google-drive";
import { buildGoogleReconnectUrl } from "@/lib/google-account-tokens";

export function googleDriveErrorResponse(error: unknown, callbackUrl = "/") {
  const reauthUrl = buildGoogleReconnectUrl(callbackUrl);

  if (error instanceof GoogleOAuthNotLinkedError) {
    return NextResponse.json(
      { error: error.message, code: "google_not_linked", reauthUrl },
      { status: 401 },
    );
  }

  if (error instanceof GoogleOAuthRefreshError) {
    return NextResponse.json(
      { error: error.message, code: "google_token_expired", reauthUrl },
      { status: 401 },
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  const needsReauth =
    /no refresh token|invalid_grant|invalid authentication|unauthorized|token has been expired/i.test(
      message,
    );

  return NextResponse.json(
    {
      error: needsReauth
        ? "נדרש חיבור מחדש ל-Google Drive. התחברו שוב עם Google (אישור הרשאות מלא)."
        : message || "שגיאה ב-Google Drive",
      code: needsReauth ? "google_reauth_required" : "drive_error",
      reauthUrl: needsReauth ? reauthUrl : undefined,
    },
    { status: needsReauth ? 401 : 500 },
  );
}

import { NextResponse } from "next/server";
import {
  GoogleOAuthNotLinkedError,
  GoogleOAuthRefreshError,
} from "@/lib/services/google-drive";
import { buildGoogleReconnectUrl } from "@/lib/google-account-tokens";

type GoogleApiErrorShape = {
  message?: string;
  response?: {
    data?: {
      error?: {
        message?: string;
        errors?: Array<{ message?: string; reason?: string }>;
      };
    };
  };
};

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const shaped = error as GoogleApiErrorShape;
    const nested = shaped.response?.data?.error?.message;
    if (typeof nested === "string" && nested.trim()) return nested;
    const reason = shaped.response?.data?.error?.errors?.[0]?.message;
    if (typeof reason === "string" && reason.trim()) return reason;
    return error.message;
  }
  return String(error);
}

function isGoogleScopeError(message: string): boolean {
  return /insufficient authentication scopes|insufficientpermissions|insufficient scope|access_token_scope_insufficient|request had insufficient authentication scopes/i.test(
    message,
  );
}

function isGoogleReauthError(message: string): boolean {
  return (
    isGoogleScopeError(message) ||
    /no refresh token|invalid_grant|invalid authentication|unauthorized|token has been expired|invalid credentials/i.test(
      message,
    )
  );
}

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

  const message = extractErrorMessage(error);
  const scopeInsufficient = isGoogleScopeError(message);
  const needsReauth = isGoogleReauthError(message);

  if (scopeInsufficient) {
    return NextResponse.json(
      {
        error:
          "חסרות הרשאות Google Drive. פתחו הגדרות → «חיבור מחדש ל-Google» ואשרו את כל ההרשאות.",
        code: "google_scope_insufficient",
        reauthUrl,
      },
      { status: 403 },
    );
  }

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

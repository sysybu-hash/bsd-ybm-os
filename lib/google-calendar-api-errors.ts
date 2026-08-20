type GoogleApiErrorShape = {
  code?: number | string;
  message?: string;
  response?: {
    status?: number;
    data?: {
      error?: {
        message?: string;
        status?: string;
        errors?: Array<{ message?: string; reason?: string }>;
      };
    };
  };
};

export type GoogleCalendarListErrorInfo = {
  code: string;
  message: string;
  needsConnect: boolean;
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

function extractHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const shaped = error as GoogleApiErrorShape;
  if (typeof shaped.response?.status === "number") return shaped.response.status;
  if (typeof shaped.code === "number") return shaped.code;
  if (typeof shaped.code === "string" && /^\d+$/.test(shaped.code)) return Number(shaped.code);
  return undefined;
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

function isCalendarApiDisabled(message: string): boolean {
  return /accessnotconfigured|has not been used in project|calendar api.+disabled|api.+is disabled/i.test(
    message,
  );
}

/** הודעות בטוחות ללקוח — בלי פרטי Google / מזהי פרויקט */
export function describeGoogleCalendarListError(error: unknown): GoogleCalendarListErrorInfo {
  const message = extractErrorMessage(error);
  const status = extractHttpStatus(error);

  if (isCalendarApiDisabled(message)) {
    return {
      code: "calendar_api_disabled",
      message: "שירות Google Calendar אינו זמין כרגע. נסו שוב מאוחר יותר.",
      needsConnect: false,
    };
  }

  if (isGoogleScopeError(message) || status === 403) {
    return {
      code: "google_scope_insufficient",
      message: "חסרות הרשאות יומן Google. יש לאשר גישה ליומן.",
      needsConnect: true,
    };
  }

  if (isGoogleReauthError(message) || status === 401) {
    return {
      code: "google_reauth_required",
      message: "נדרש חיבור מחדש ל-Google Calendar.",
      needsConnect: true,
    };
  }

  return {
    code: "calendar_list_failed",
    message: "לא ניתן לטעון את רשימת היומנים.",
    needsConnect: true,
  };
}

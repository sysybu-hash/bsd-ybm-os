import { NextResponse } from "next/server";
import type { ZodIssue } from "zod";

/** הודעות ברירת מחדל — עקביות בין נתיבי API, middleware ולקוח */
export const API_MSG_UNAUTHORIZED = "נדרשת התחברות.";
export const API_MSG_FORBIDDEN = "אין הרשאה לפעולה זו.";
export const API_MSG_VALIDATION_FAILED = "נכשל אימות נתונים";

export type ApiErrorBody = {
  error: string;
  code?: string;
  issues?: ZodIssue[];
};

export function jsonUnauthorized(message: string = API_MSG_UNAUTHORIZED) {
  return NextResponse.json(
    { error: message, code: "unauthorized" } satisfies ApiErrorBody,
    { status: 401 },
  );
}

export function jsonForbidden(message: string = API_MSG_FORBIDDEN) {
  return NextResponse.json(
    { error: message, code: "forbidden" } satisfies ApiErrorBody,
    { status: 403 },
  );
}

export function jsonBadRequest(message: string, code = "bad_request") {
  return NextResponse.json({ error: message, code } satisfies ApiErrorBody, { status: 400 });
}

export function jsonValidationFailed(issues: ZodIssue[], message = API_MSG_VALIDATION_FAILED) {
  return NextResponse.json(
    { error: message, code: "validation_failed", issues } satisfies ApiErrorBody,
    { status: 400 },
  );
}

export function jsonNotFound(message: string, code = "not_found") {
  return NextResponse.json({ error: message, code } satisfies ApiErrorBody, { status: 404 });
}

export function jsonConflict(message: string, code = "conflict") {
  return NextResponse.json({ error: message, code } satisfies ApiErrorBody, { status: 409 });
}

/** 410 — למשל הזמנה שכבר נוצלה */
export function jsonGone(message: string, code = "gone") {
  return NextResponse.json({ error: message, code } satisfies ApiErrorBody, { status: 410 });
}

export function jsonServerError(message = "שגיאת שרת", code = "internal_error") {
  return NextResponse.json({ error: message, code } satisfies ApiErrorBody, { status: 500 });
}

export function jsonServiceUnavailable(message: string, code = "service_unavailable") {
  return NextResponse.json({ error: message, code } satisfies ApiErrorBody, { status: 503 });
}

export function jsonTooManyRequests(
  message: string,
  code = "rate_limited",
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    { error: message, code, ...extra } satisfies ApiErrorBody & Record<string, unknown>,
    { status: 429 },
  );
}

export function jsonBadGateway(message: string, code = "bad_gateway") {
  return NextResponse.json({ error: message, code } satisfies ApiErrorBody, { status: 502 });
}

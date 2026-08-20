import type { UserRole } from "@prisma/client";

/**
 * תפקידים במצב קריאה-בלבד בתוך הארגון. כרגע רק ACCOUNTANT (רו"ח חיצוני):
 * רשאי לצפות ולייצא מסמכים/הוצאות/הנהלת חשבונות, אך לא ליצור/לערוך/למחוק,
 * ולא לגשת ל-CRM, פרויקטים, הגדרות או מרכז ה-AI.
 */
export const READ_ONLY_ORG_ROLES: readonly UserRole[] = ["ACCOUNTANT"];

function normalize(role: string | null | undefined): string {
  return String(role ?? "").trim().toUpperCase();
}

export function isAccountantRole(role: string | null | undefined): boolean {
  return normalize(role) === "ACCOUNTANT";
}

/** true אם התפקיד מוגבל לקריאה-בלבד ברמת הארגון. */
export function isReadOnlyOrgRole(role: string | null | undefined): boolean {
  return READ_ONLY_ORG_ROLES.includes(normalize(role) as UserRole);
}

/** מתודות HTTP שאינן משנות מצב — מותרות לתפקיד קריאה-בלבד. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeHttpMethod(method: string | null | undefined): boolean {
  return SAFE_METHODS.has(String(method ?? "GET").toUpperCase());
}

/**
 * true אם יש לחסום את הבקשה: תפקיד קריאה-בלבד שמנסה מתודת-כתיבה
 * בנתיב שלא הצהיר במפורש `allowReadOnlyRoles`.
 */
export function shouldBlockReadOnlyRole(
  role: string | null | undefined,
  method: string | null | undefined,
  allowReadOnlyRoles: boolean | undefined,
): boolean {
  if (allowReadOnlyRoles) return false;
  if (!isReadOnlyOrgRole(role)) return false;
  return !isSafeHttpMethod(method);
}

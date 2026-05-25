import { Prisma } from "@prisma/client";

/** הודעת שגיאה קריאה מ-Prisma / unknown (ללוגים ו-API). */
export function prismaErrorMessage(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta =
      err.meta && typeof err.meta === "object" ? ` ${JSON.stringify(err.meta)}` : "";
    return `${err.code}: ${err.message}${meta}`;
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "object" && err !== null) {
    const o = err as { message?: unknown; code?: unknown };
    if (typeof o.message === "string") return o.message;
    if (typeof o.code === "string") return o.code;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

export function prismaErrorCode(err: unknown): string | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code;
  }
  return undefined;
}

/** הודעה בעברית למשתמש; `null` אם אין מיפוי ידוע (ה-handler ישתמש בהודעה כללית). */
export function getUserFacingDbErrorMessage(err: unknown): string | null {
  const code = prismaErrorCode(err);
  const message = prismaErrorMessage(err);
  if (code === "P2003") {
    return "חשבון לא מקושר לארגון פעיל. התנתקו והתחברו מחדש.";
  }
  if (code === "P2021" || /does not exist/i.test(message)) {
    return "מסד הנתונים לא מעודכן. פנו למנהל המערכת או הריצו מיגרציות.";
  }
  if (code === "P1001" || /can't reach|connection/i.test(message)) {
    return "לא ניתן להתחבר למסד הנתונים. נסו שוב בעוד רגע.";
  }
  return null;
}

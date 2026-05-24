/** הודעות עברית לשגיאות Prisma/Postgres — בלי לחשוף host או סודות */
export function getUserFacingDbErrorMessage(err: unknown): string | null {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  const lower = message.toLowerCase();

  if (
    lower.includes("can't reach database server") ||
    lower.includes("p1001") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("enotfound")
  ) {
    return (
      "לא ניתן להתחבר למסד הנתונים (Neon). " +
      "היכנסו ללוח הבקרה של Neon, ודאו שהפרויקט פעיל (לא מושהה), " +
      "העתיקו מחדש את מחרוזת החיבור ל־DATABASE_URL ב־.env.local, והפעילו מחדש את שרת הפיתוח."
    );
  }

  if (
    lower.includes("p1000") ||
    lower.includes("authentication failed") ||
    lower.includes("password authentication failed")
  ) {
    return (
      "שגיאת התחברות למסד הנתונים — הסיסמה ב־DATABASE_URL אינה תקינה. " +
      "ב-Neon: Connect → Copy snippet, עדכנו את .env.local והפעילו מחדש את שרת הפיתוח."
    );
  }

  if (lower.includes("p1002") || lower.includes("p1017")) {
    return "מסד הנתונים לא זמין כרגע. נסו שוב בעוד רגע.";
  }

  if (
    lower.includes("p2021") ||
    lower.includes("p2022") ||
    lower.includes("does not exist in the current database") ||
    (lower.includes("table") && lower.includes("does not exist")) ||
    (lower.includes("column") && lower.includes("does not exist"))
  ) {
    return (
      "מבנה מסד הנתונים לא מעודכן (חסרות עמודות או טבלאות). " +
      "הריצו prisma migrate deploy על בסיס הייצור או פנו למנהל המערכת."
    );
  }

  return null;
}

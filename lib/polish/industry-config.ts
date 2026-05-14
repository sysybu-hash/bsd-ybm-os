import type { Prisma } from "@prisma/client";

/** תואם ללוגיקה ב־`polishOrganizationState` — מתי למלא ברירת מחדל ל־`industryConfigJson` */
export function needsIndustryConfigPolish(
  json: Prisma.JsonValue | null | undefined,
): boolean {
  if (json === null || json === undefined) return true;
  if (typeof json === "object" && !Array.isArray(json) && Object.keys(json as object).length === 0) {
    return true;
  }
  return false;
}

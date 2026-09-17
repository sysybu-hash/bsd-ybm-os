import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { isCompanyMgmtIndustry } from "@/lib/business-lines";
import { prisma } from "@/lib/prisma";

/**
 * חוסם API ספציפי לבנייה (BOQ, יומן שטח וכו') לענף ניהול עסק.
 *
 * מנהל פלטפורמה (SUPER_ADMIN) עובר: הוא בודק ומתחזק כל מודול בכל ארגון,
 * והתפקיד הזה ניתן רק לכתובות שמוגדרות כמנהלי המערכת — כל משתמש אחר מורד
 * ל-ORG_ADMIN בזמן ההתחברות.
 */
export async function guardConstructionOnlyApi(
  orgId: string,
  role?: UserRole | string | null,
): Promise<NextResponse | null> {
  if (role === "SUPER_ADMIN") return null;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { industry: true },
  });
  if (isCompanyMgmtIndustry(org?.industry)) {
    return NextResponse.json(
      { error: "מודול זה זמין רק לענף בנייה וקבלנות" },
      { status: 403 },
    );
  }
  return null;
}

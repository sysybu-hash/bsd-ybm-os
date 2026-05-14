import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { needsIndustryConfigPolish } from "@/lib/polish/industry-config";

const DEFAULT_INDUSTRY_CONFIG: Prisma.JsonObject = {
  theme: "system",
  notifications: true,
};

/**
 * מילוי `industryConfigJson` מתוך RSC (layout) — **לא** Server Action.
 * קריאה ל־`polishOrganizationState` מתוך רינדור layout גרמה לכשלי RSC בפרודקשן (Next 15).
 */
export async function polishOrganizationIndustryConfigFromRsc(
  organizationId: string,
  userId: string,
): Promise<boolean> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { industryConfigJson: true },
    });
    if (!org || !needsIndustryConfigPolish(org.industryConfigJson)) {
      return false;
    }

    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        industryConfigJson: { ...DEFAULT_INDUSTRY_CONFIG },
        activityLogs: {
          create: {
            userId,
            action: "SYSTEM_POLISH",
            details: "מילוי ברירת מחדל ל-industryConfigJson בעת טעינת workspace",
          },
        },
      },
    });
    return true;
  } catch (e) {
    console.error("[polishOrganizationIndustryConfigFromRsc]", e);
    return false;
  }
}

"use server";

import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import type { ActionResponse } from "@/lib/polish/action-response";
import { needsIndustryConfigPolish } from "@/lib/polish/industry-config";
import { prisma } from "@/lib/prisma";

const DEFAULT_INDUSTRY_CONFIG: Prisma.JsonObject = {
  theme: "system",
  notifications: true,
};

/**
 * ממלא `industryConfigJson` ברירת מחדל אם חסר — רק למשתמש השייך לארגון.
 * לא יוצר ActivityLog אם לא בוצע שינוי אמיתי.
 */
export async function polishOrganizationState(orgId: string): Promise<ActionResponse<{ patched: boolean }>> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const userOrgId = session.user.organizationId ?? null;
  if (!userOrgId || userOrgId !== orgId) {
    return { success: false, error: "Forbidden" };
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, industryConfigJson: true },
    });

    if (!org) {
      return { success: false, error: "Organization not found" };
    }

    if (!needsIndustryConfigPolish(org.industryConfigJson)) {
      return { success: true, data: { patched: false } };
    }

    const merged: Prisma.JsonObject = { ...DEFAULT_INDUSTRY_CONFIG };

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        industryConfigJson: merged,
        activityLogs: {
          create: {
            userId: session.user.id,
            action: "SYSTEM_POLISH",
            details: "מילוי ברירת מחדל ל-industryConfigJson בעת טעינת workspace",
          },
        },
      },
    });

    /** לא קוראים ל־`revalidatePath` כאן — ייתכן קריאה מתוך RSC (layout); הרינדור המקומי מרענן דרך refetch ב־layout */
    return { success: true, data: { patched: true } };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[workspace-polish]", message);
    return { success: false, error: message };
  }
}

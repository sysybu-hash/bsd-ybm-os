"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CONSTRUCTION_TRADE_IDS, type ConstructionTradeId } from "@/lib/construction-trades";
import { prisma } from "@/lib/prisma";

export type UpdateOrganizationTradeResult =
  | { success: true }
  | { success: false; error: string };

export async function updateOrganizationTrade(tradeId: string): Promise<UpdateOrganizationTradeResult> {
  try {
    const session = await getServerSession(authOptions);
    const orgId = session?.user?.organizationId;
    if (!orgId) {
      return { success: false, error: "נדרשת התחברות לארגון." };
    }

    const raw = String(tradeId ?? "").trim().toUpperCase();
    if (!CONSTRUCTION_TRADE_IDS.includes(raw as ConstructionTradeId)) {
      return { success: false, error: "מקצוע לא נתמך." };
    }

    await prisma.organization.update({
      where: { id: orgId },
      data: { constructionTrade: raw },
    });

    revalidatePath("/app/settings/organization");
    revalidatePath("/app");
    revalidatePath("/app/settings/profession");

    return { success: true };
  } catch (error) {
    console.error("updateOrganizationTrade:", error);
    return { success: false, error: "עדכון המקצוע נכשל." };
  }
}

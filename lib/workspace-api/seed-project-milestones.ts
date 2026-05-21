import { prisma } from "@/lib/prisma";
import { getDefaultPaymentMilestonesForIndustry } from "@/lib/project-payment-milestones";

/** יוצר אבני דרך עסקיות ברירת מחדל לפרויקט ריק (ניהול עסק בלבד) */
export async function seedDefaultPaymentMilestonesIfEmpty(
  projectId: string,
  orgId: string,
  industryRaw?: string | null,
): Promise<number> {
  const presets = getDefaultPaymentMilestonesForIndustry(industryRaw);
  if (presets.length === 0) return 0;

  const count = await prisma.paymentMilestone.count({
    where: { projectId, organizationId: orgId },
  });
  if (count > 0) return 0;

  await prisma.paymentMilestone.createMany({
    data: presets.map((p) => ({
      projectId,
      organizationId: orgId,
      name: p.name,
      amount: p.amount,
      sortOrder: p.sortOrder,
    })),
  });
  return presets.length;
}

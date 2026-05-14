import { prisma } from "@/lib/prisma";

export type PriceSpikeAlert = {
  normalizedKey: string;
  description: string;
  changePercent: number;
  latestPrice: number;
  previousPrice: number;
};

/** מוצרים שמחיר הרכישה האחרון עלה לעומת התצפית הקודמת (מסריקות / תצפיות מחיר) */
export async function getPriceSpikeAlerts(
  organizationId: string,
  limit = 8,
): Promise<PriceSpikeAlert[]> {
  const observations = await prisma.productPriceObservation.findMany({
    where: { organizationId },
    orderBy: { observedAt: "desc" },
    take: 2500,
  });

  const byKey = new Map<string, typeof observations>();
  for (const o of observations) {
    const list = byKey.get(o.normalizedKey) ?? [];
    list.push(o);
    byKey.set(o.normalizedKey, list);
  }

  const spikes: PriceSpikeAlert[] = [];

  for (const [normalizedKey, list] of byKey) {
    const sorted = [...list].sort(
      (a, b) => b.observedAt.getTime() - a.observedAt.getTime(),
    );
    if (sorted.length < 2) continue;
    const latest = sorted[0]!;
    const prev = sorted[1]!;
    if (latest.unitPrice <= prev.unitPrice * 1.008) continue;
    const changePercent = ((latest.unitPrice - prev.unitPrice) / prev.unitPrice) * 100;
    spikes.push({
      normalizedKey,
      description: latest.description,
      changePercent,
      latestPrice: latest.unitPrice,
      previousPrice: prev.unitPrice,
    });
  }

  spikes.sort((a, b) => b.changePercent - a.changePercent);
  return spikes.slice(0, limit);
}

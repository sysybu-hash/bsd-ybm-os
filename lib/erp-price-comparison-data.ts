import { prisma } from "@/lib/prisma";
import { getPriceSpikeAlerts } from "@/lib/erp-price-spikes";

export type PriceChartRow = { date: string; price: number };

/** נתונים לגרף השוואת מחיר — לפי פריט עם עלייה אחרונה או לפי הפריט הראשון עם מספיק רכישות */
export async function getErpPriceComparisonForOrg(
  organizationId: string,
): Promise<{ productName: string; data: PriceChartRow[] } | null> {
  const spikes = await getPriceSpikeAlerts(organizationId, 3);
  const keysToTry = spikes.map((s) => s.normalizedKey);

  if (keysToTry.length === 0) {
    const anyLines = await prisma.documentLineItem.findMany({
      where: {
        organizationId,
        unitPrice: { gt: 0 },
      },
      select: { normalizedKey: true },
      take: 80,
    });
    const seen = new Set<string>();
    for (const l of anyLines) {
      if (!seen.has(l.normalizedKey)) {
        seen.add(l.normalizedKey);
        keysToTry.push(l.normalizedKey);
      }
      if (keysToTry.length >= 3) break;
    }
  }

  for (const normalizedKey of keysToTry) {
    const lines = await prisma.documentLineItem.findMany({
      where: {
        organizationId,
        normalizedKey,
        unitPrice: { not: null, gt: 0 },
      },
      include: {
        document: { select: { createdAt: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 12,
    });

    if (lines.length < 2) continue;

    const firstDesc = lines.find((l) => l.description?.trim())?.description ?? normalizedKey;
    const data: PriceChartRow[] = lines.map((l) => {
      const d = l.document?.createdAt ?? l.createdAt;
      return {
        date: d.toLocaleDateString("he-IL"),
        price: l.unitPrice as number,
      };
    });

    return { productName: firstDesc, data };
  }

  return null;
}

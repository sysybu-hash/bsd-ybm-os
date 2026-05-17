import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import type { PriceCompareRow } from "@/lib/price-compare-types";

export const GET = withWorkspacesAuth(async (_req, { orgId }) => {
  const observations = await prisma.productPriceObservation.findMany({
    where: { organizationId: orgId },
    orderBy: { observedAt: "desc" },
    take: 2000,
  });

  const byKey = new Map<string, typeof observations>();
  for (const o of observations) {
    const list = byKey.get(o.normalizedKey) ?? [];
    list.push(o);
    byKey.set(o.normalizedKey, list);
  }

  const rows: PriceCompareRow[] = [];

  for (const [normalizedKey, list] of byKey) {
    if (list.length === 0) continue;
    const byPrice = [...list].sort((a, b) => a.unitPrice - b.unitPrice);
    const best = byPrice[0]!;
    const latest = list[0]!;
    const cheaperAlternative =
      latest.id !== best.id && latest.unitPrice > best.unitPrice + 0.005;
    const savingsIfBuyAtBest = cheaperAlternative
      ? Math.max(0, latest.unitPrice - best.unitPrice)
      : 0;

    rows.push({
      normalizedKey,
      description: latest.description,
      bestUnitPrice: best.unitPrice,
      bestSupplier: best.supplierName,
      latestUnitPrice: latest.unitPrice,
      latestSupplier: latest.supplierName,
      latestAt: latest.observedAt.toISOString(),
      cheaperAlternative,
      savingsIfBuyAtBest,
    });
  }

  rows.sort((a, b) => Number(b.cheaperAlternative) - Number(a.cheaperAlternative));

  return NextResponse.json({ rows: rows.slice(0, 200) });
});

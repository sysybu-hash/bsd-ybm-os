"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAiResponse } from "@/lib/ai-engine-access";

export type CompareSupplierPricesResult =
  | {
      ok: true;
      latestPrice: number;
      previousPrice: number;
      changePercent: number;
      insight: string;
    }
  | { ok: false; error: string };

/** השוואת שתי רכישות אחרונות לפי מפתח מנורמל (normalizedKey) */
export async function compareSupplierPrices(
  normalizedKey: string,
): Promise<CompareSupplierPricesResult> {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.organizationId;
  if (!session?.user?.id || !orgId) {
    return { ok: false, error: "גישה נדחתה" };
  }

  const key = normalizedKey.trim();
  if (!key) {
    return { ok: false, error: "חסר מזהה מוצר" };
  }

  const lines = await prisma.documentLineItem.findMany({
    where: { organizationId: orgId, normalizedKey: key },
    include: {
      document: { select: { createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const withPrice = lines.filter(
    (l) => l.unitPrice != null && Number.isFinite(l.unitPrice) && (l.unitPrice as number) > 0,
  );
  if (withPrice.length < 2) {
    return { ok: false, error: "אין מספיק נתונים להשוואה" };
  }

  const latest = withPrice[0]!;
  const previous = withPrice[1]!;
  const lp = latest.unitPrice as number;
  const pp = previous.unitPrice as number;
  const priceDiff = ((lp - pp) / pp) * 100;

  const dLatest = latest.document?.createdAt ?? latest.createdAt;
  const dPrev = previous.document?.createdAt ?? previous.createdAt;

  const insight = await generateAiResponse(
    `נתח עסקת רכש: המוצר "${latest.description}" נקנה ב-${pp.toFixed(2)} ש"ח (תאריך ${dPrev.toLocaleDateString("he-IL")}) ואחר כך ב-${lp.toFixed(2)} ש"ח (תאריך ${dLatest.toLocaleDateString("he-IL")}). הפרש אחוזי: ${priceDiff.toFixed(2)}%. תן המלצה קצרה וחדה למנהל הרכש.`,
  );

  return {
    ok: true,
    latestPrice: lp,
    previousPrice: pp,
    changePercent: priceDiff,
    insight,
  };
}

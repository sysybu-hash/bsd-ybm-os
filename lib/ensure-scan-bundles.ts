import { prisma } from "@/lib/prisma";

const DEFAULT_BUNDLES: {
  slug: string;
  name: string;
  description: string;
  priceIls: number;
  cheapAdds: number;
  premiumAdds: number;
  sortOrder: number;
}[] = [
  {
    slug: "cheap-25",
    name: "+25 סריקות זולות",
    description: "מנוע Gemini — מתאים כשמכסת המנוי נגמרה",
    priceIls: 19.9,
    cheapAdds: 25,
    premiumAdds: 0,
    sortOrder: 10,
  },
  {
    slug: "cheap-100",
    name: "+100 סריקות זולות",
    description: "חבילת המשך לסריקות יומיומיות",
    priceIls: 59.9,
    cheapAdds: 100,
    premiumAdds: 0,
    sortOrder: 20,
  },
  {
    slug: "premium-10",
    name: "+10 סריקות פרימיום",
    description: "OpenAI / Anthropic — דיוק גבוה",
    priceIls: 89.9,
    cheapAdds: 0,
    premiumAdds: 10,
    sortOrder: 30,
  },
];

/** יוצר חבילות ברירת מחדל אם חסרות */
export async function ensureDefaultScanBundles(): Promise<void> {
  for (const b of DEFAULT_BUNDLES) {
    await prisma.scanBundle.upsert({
      where: { slug: b.slug },
      create: { ...b, isActive: true },
      update: {
        name: b.name,
        description: b.description,
        priceIls: b.priceIls,
        cheapAdds: b.cheapAdds,
        premiumAdds: b.premiumAdds,
        sortOrder: b.sortOrder,
        isActive: true,
      },
    });
  }
}

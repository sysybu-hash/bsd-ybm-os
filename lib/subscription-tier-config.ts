/** ערכי רמת מנוי — תואם ל־enum SubscriptionTier ב־Prisma */
export type SubscriptionTierKey =
  | "FREE"
  | "HOUSEHOLD"
  | "DEALER"
  | "COMPANY"
  | "CORPORATE";

/** רמות לבחירה באדמין ובממשק */
export const ADMIN_SUBSCRIPTION_TIER_OPTIONS: SubscriptionTierKey[] = [
  "FREE",
  "HOUSEHOLD",
  "DEALER",
  "COMPANY",
  "CORPORATE",
];

/** חברות „ללא הגבלה” מעשית לרמת תאגיד */
export const CORPORATE_MAX_COMPANIES_EFFECTIVE = 999_999;

export type TierAllowance = {
  cheapScans: number;
  premiumScans: number;
  maxCompanies: number;
  /** מחיר מנוי חודשי בשקלים; null = צור קשר */
  monthlyPriceIls: number | null;
  /** תווית „מומלץ” בגריד מחירים */
  recommended?: boolean;
  /** להצגה: חברות ללא הגבלה */
  unlimitedCompanies?: boolean;
};

const TIER_ALLOWANCES: Record<SubscriptionTierKey, TierAllowance> = {
  FREE: {
    cheapScans: 10,
    premiumScans: 0,
    maxCompanies: 1,
    monthlyPriceIls: 0,
  },
  HOUSEHOLD: {
    cheapScans: 50,
    premiumScans: 5,
    maxCompanies: 1,
    monthlyPriceIls: 59.9,
  },
  DEALER: {
    cheapScans: 100,
    premiumScans: 15,
    maxCompanies: 1,
    monthlyPriceIls: 99.9,
    recommended: true,
  },
  COMPANY: {
    cheapScans: 200,
    premiumScans: 40,
    maxCompanies: 2,
    monthlyPriceIls: 159.9,
  },
  CORPORATE: {
    cheapScans: 500,
    premiumScans: 100,
    maxCompanies: CORPORATE_MAX_COMPANIES_EFFECTIVE,
    monthlyPriceIls: 299.9,
    unlimitedCompanies: true,
  },
};

export function tierAllowance(tier: SubscriptionTierKey | string): TierAllowance {
  const t = parseSubscriptionTier(tier);
  return t ? TIER_ALLOWANCES[t] : TIER_ALLOWANCES.FREE;
}

export function tierLabelHe(tier: string): string {
  const u = (tier || "FREE").toUpperCase();
  switch (u) {
    case "FREE":
      return "חינם (ניסיון)";
    case "HOUSEHOLD":
      return "משק בית";
    case "DEALER":
      return "עוסק מורשה";
    case "COMPANY":
      return "חברה";
    case "CORPORATE":
      return "תאגיד";
    default:
      return tier;
  }
}

export function tierRank(tier: SubscriptionTierKey | string): number {
  const t = parseSubscriptionTier(tier) ?? "FREE";
  const order: SubscriptionTierKey[] = [
    "FREE",
    "HOUSEHOLD",
    "DEALER",
    "COMPANY",
    "CORPORATE",
  ];
  const i = order.indexOf(t);
  return i >= 0 ? i : 0;
}

export function parseSubscriptionTier(raw: string | null | undefined): SubscriptionTierKey | null {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (
    u === "FREE" ||
    u === "HOUSEHOLD" ||
    u === "DEALER" ||
    u === "COMPANY" ||
    u === "CORPORATE"
  ) {
    return u;
  }
  return null;
}

/** מנויים בתשלום ישיר ב-PayPal (לא כולל FREE) */
export function paypalPurchasableTiers(): SubscriptionTierKey[] {
  return ADMIN_SUBSCRIPTION_TIER_OPTIONS.filter((t) => {
    if (t === "FREE") return false;
    return TIER_ALLOWANCES[t].monthlyPriceIls != null;
  });
}

export function defaultScanBalancesForTier(tier: SubscriptionTierKey | string): {
  cheapScansRemaining: number;
  premiumScansRemaining: number;
  maxCompanies: number;
} {
  const t = parseSubscriptionTier(tier) ?? "FREE";
  const a = TIER_ALLOWANCES[t];
  return {
    cheapScansRemaining: a.cheapScans,
    premiumScansRemaining: a.premiumScans,
    maxCompanies: a.maxCompanies,
  };
}

/** טקסט ל-AI / תיעוד — מחירון BSD-YBM */
export function subscriptionTiersPromptBlockHe(): string {
  return `מחירון מנוי BSD-YBM (ILS, סריקה זולה=Gemini, פרימיום=OpenAI/Claude):
- FREE: 0 ₪, 10 סריקות זולות, 0 פרימיום, ניסיון חודש.
- HOUSEHOLD: 59.90 ₪, 50 זולות, 5 פרימיום.
- DEALER (מומלץ לעוסקים): 99.90 ₪, 100 זולות, 15 פרימיום.
- COMPANY: 159.90 ₪, 200 זולות, 40 פרימיום, עד 2 חברות.
- CORPORATE: 299.90 ₪, 500 זולות, 100 פרימיום, חברות ללא הגבלה מעשית.
המלץ לרמה לפי תיאור המשתמש (למשל "אני עוסק" → DEALER, "חברה" → COMPANY).`;
}

export function executiveTierOptionsForSelect(): { value: string; label: string }[] {
  return ADMIN_SUBSCRIPTION_TIER_OPTIONS.map((t) => ({
    value: t,
    label: `${tierLabelHe(t)} (${t})`,
  }));
}

export function legacyPlanToTierKey(plan: string | null | undefined): SubscriptionTierKey {
  const u = String(plan ?? "")
    .trim()
    .toUpperCase();
  switch (u) {
    case "PRO":
      return "HOUSEHOLD";
    case "BUSINESS":
      return "COMPANY";
    case "ENTERPRISE":
      return "CORPORATE";
    case "FREE":
    case "HOUSEHOLD":
    case "DEALER":
    case "COMPANY":
    case "CORPORATE":
      return u;
    default:
      return "FREE";
  }
}

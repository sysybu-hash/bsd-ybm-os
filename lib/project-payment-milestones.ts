import { isCompanyMgmtIndustry } from "@/lib/business-lines";
import { CONSTRUCTION_PROJECT_SUB_DOMAINS } from "@/lib/project-sub-domains";

export type PaymentMilestoneSeed = {
  name: string;
  amount: number;
  sortOrder: number;
};

/** שלבי תשלום גנריים לניהול עסק — לא מקצועות בנייה */
export const BUSINESS_PAYMENT_MILESTONE_PRESETS: PaymentMilestoneSeed[] = [
  { name: "חתימת הסכם / הצעה", amount: 0, sortOrder: 0 },
  { name: "מקדמה", amount: 0, sortOrder: 1 },
  { name: "אספקה / מסירה", amount: 0, sortOrder: 2 },
  { name: "חשבונית ביניים", amount: 0, sortOrder: 3 },
  { name: "סיום ומסירה", amount: 0, sortOrder: 4 },
];

const BUSINESS_MILESTONE_NAME_ALLOWLIST = new Set(
  BUSINESS_PAYMENT_MILESTONE_PRESETS.map((p) => p.name.trim()),
);

const CONSTRUCTION_MILESTONE_EXTRA_HINTS = [
  "הריס",
  "פירוק",
  "חדרי רחצה",
  "אמבט",
  "שירותים",
  "כתב כמויות",
  "חשבון חלקי",
  "התקדמות בנייה",
  "גרמושקה",
  "boq",
  "demolition",
  "plumbing",
  "drywall",
  "parquet",
  "sanitary",
  "bathroom",
];

function constructionMilestoneHints(): string[] {
  const fromDomains = CONSTRUCTION_PROJECT_SUB_DOMAINS.flatMap((d) => d.keywords);
  return [...new Set([...fromDomains, ...CONSTRUCTION_MILESTONE_EXTRA_HINTS])].filter(
    (h) => h.trim().length >= 3,
  );
}

let cachedHints: string[] | null = null;

function getConstructionMilestoneHints(): string[] {
  if (!cachedHints) cachedHints = constructionMilestoneHints();
  return cachedHints;
}

/** מזהה שם אבן דרך שמקורו בתבנית בנייה / כתב כמויות */
export function isConstructionPaymentMilestoneName(name: string): boolean {
  const trimmed = name.trim();
  if (BUSINESS_MILESTONE_NAME_ALLOWLIST.has(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  if (!lower) return false;
  return getConstructionMilestoneHints().some((hint) => {
    const h = hint.trim().toLowerCase();
    return h.length >= 2 && lower.includes(h);
  });
}

export function getDefaultPaymentMilestonesForIndustry(
  industryRaw?: string | null,
): PaymentMilestoneSeed[] {
  if (isCompanyMgmtIndustry(industryRaw)) {
    return BUSINESS_PAYMENT_MILESTONE_PRESETS;
  }
  return [];
}

export function filterPaymentMilestonesForDisplay<
  T extends { name: string },
>(industryRaw: string | null | undefined, milestones: T[]): T[] {
  if (!isCompanyMgmtIndustry(industryRaw)) return milestones;
  return milestones.filter((m) => !isConstructionPaymentMilestoneName(m.name));
}

export function countHiddenConstructionMilestones(
  industryRaw: string | null | undefined,
  milestones: Array<{ name: string }>,
): number {
  if (!isCompanyMgmtIndustry(industryRaw)) return 0;
  return milestones.filter((m) => isConstructionPaymentMilestoneName(m.name)).length;
}

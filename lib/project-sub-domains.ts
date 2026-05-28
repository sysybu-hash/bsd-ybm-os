import type { DocType } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import { isCompanyMgmtIndustry } from "@/lib/business-lines";
import { normalizeIndustryType } from "@/lib/professions/config";
import {
  Box,
  BrickWall,
  Briefcase,
  ChartLine,
  Droplets,
  Hammer,
  Headphones,
  Layers,
  Megaphone,
  Paintbrush,
  Plug,
  Shield,
  SquareStack,
  Users,
  Wind,
  Wrench,
} from "lucide-react";

export type ConstructionSubDomainId =
  | "SKELETON"
  | "PLUMBING"
  | "DRYWALL"
  | "FLOORING"
  | "ELECTRICAL"
  | "HVAC"
  | "FINISHING"
  | "METALWORK"
  | "WATERPROOFING"
  | "PAINTING"
  | "GENERAL";

export type BusinessSubDomainId =
  | "SALES"
  | "OPERATIONS"
  | "FINANCE"
  | "HR"
  | "PRODUCT"
  | "MARKETING"
  | "GENERAL";

export type ProjectSubDomainId = ConstructionSubDomainId | BusinessSubDomainId;

export type ProjectSubDomainDocShortcut = {
  docType: DocType;
  labelHe: string;
};

const ERP_SHORTCUTS: ProjectSubDomainDocShortcut[] = [
  { docType: "QUOTE", labelHe: "הצעת מחיר" },
  { docType: "TRANSACTION_INVOICE", labelHe: "חשבון התקדמות" },
  { docType: "INVOICE", labelHe: "חשבונית" },
  { docType: "INVOICE_RECEIPT", labelHe: "חשבונית מס קבלה" },
];

export type ProjectSubDomain = {
  id: ProjectSubDomainId;
  labelHe: string;
  icon: LucideIcon;
  /** מילות מפתח לשיוך אוטומטי משם משימה / כותרת BOQ */
  keywords: string[];
  docShortcuts: ProjectSubDomainDocShortcut[];
};

const BUSINESS_ERP_SHORTCUTS: ProjectSubDomainDocShortcut[] = [
  { docType: "QUOTE", labelHe: "הצעת מחיר" },
  { docType: "INVOICE", labelHe: "חשבונית" },
  { docType: "INVOICE_RECEIPT", labelHe: "חשבונית מס קבלה" },
  { docType: "RECEIPT", labelHe: "קבלה" },
];

export const BUSINESS_PROJECT_SUB_DOMAINS: ProjectSubDomain[] = [
  {
    id: "SALES",
    labelHe: "מכירות",
    icon: Briefcase,
    keywords: ["מכיר", "ליד", "הצעה", "עסקה", "לקוח"],
    docShortcuts: BUSINESS_ERP_SHORTCUTS,
  },
  {
    id: "OPERATIONS",
    labelHe: "תפעול",
    icon: Headphones,
    keywords: ["תפעול", "ביצוע", "משלוח", "שירות", "תהליך"],
    docShortcuts: BUSINESS_ERP_SHORTCUTS,
  },
  {
    id: "FINANCE",
    labelHe: "כספים",
    icon: ChartLine,
    keywords: ["כספים", "תזרים", "חשבונית", "תשלום", "מעמ"],
    docShortcuts: BUSINESS_ERP_SHORTCUTS,
  },
  {
    id: "HR",
    labelHe: "משאבי אנוש",
    icon: Users,
    keywords: ["גיוס", "צוות", "שכר", "hr", "עובד"],
    docShortcuts: BUSINESS_ERP_SHORTCUTS,
  },
  {
    id: "PRODUCT",
    labelHe: "מוצר / פיתוח",
    icon: Box,
    keywords: ["מוצר", "פיתוח", "ספרינט", "גרסה", "feature"],
    docShortcuts: BUSINESS_ERP_SHORTCUTS,
  },
  {
    id: "MARKETING",
    labelHe: "שיווק",
    icon: Megaphone,
    keywords: ["שיווק", "קמפיין", "פרסום", "מותג", "תוכן"],
    docShortcuts: BUSINESS_ERP_SHORTCUTS,
  },
  {
    id: "GENERAL",
    labelHe: "כללי",
    icon: Briefcase,
    keywords: [],
    docShortcuts: BUSINESS_ERP_SHORTCUTS,
  },
];

export const CONSTRUCTION_PROJECT_SUB_DOMAINS: ProjectSubDomain[] = [
  {
    id: "SKELETON",
    labelHe: "שלד",
    icon: BrickWall,
    keywords: ["שלד", "בטון", "ברזל", "יציקה", "קורות"],
    docShortcuts: ERP_SHORTCUTS,
  },
  {
    id: "PLUMBING",
    labelHe: "אינסטלציה",
    icon: Droplets,
    keywords: ["אינסטל", "מים", "ביוב", "צנרת", "סניטרי"],
    docShortcuts: ERP_SHORTCUTS,
  },
  {
    id: "DRYWALL",
    labelHe: "גבס",
    icon: Layers,
    keywords: ["גבס", "קירות", "תקרה", "מחיצות"],
    docShortcuts: ERP_SHORTCUTS,
  },
  {
    id: "FLOORING",
    labelHe: "ריצוף",
    icon: SquareStack,
    keywords: ["ריצוף", "קרמיקה", "אבן", "פרקט"],
    docShortcuts: ERP_SHORTCUTS,
  },
  {
    id: "ELECTRICAL",
    labelHe: "חשמל",
    icon: Plug,
    keywords: ["חשמל", "לוח", "תאורה", "כבלים"],
    docShortcuts: ERP_SHORTCUTS,
  },
  {
    id: "HVAC",
    labelHe: "מיזוג",
    icon: Wind,
    keywords: ["מיזוג", "מיזוג אוויר", "צ'ילר", "מאייד"],
    docShortcuts: ERP_SHORTCUTS,
  },
  {
    id: "FINISHING",
    labelHe: "גמר",
    icon: Hammer,
    keywords: ["גמר", "נגרות", "מטבח", "דלתות"],
    docShortcuts: ERP_SHORTCUTS,
  },
  {
    id: "METALWORK",
    labelHe: "מסגרות",
    icon: Wrench,
    keywords: ["מסגרות", "ברזל", "מעקה", "מדרגות"],
    docShortcuts: ERP_SHORTCUTS,
  },
  {
    id: "WATERPROOFING",
    labelHe: "איטום",
    icon: Shield,
    keywords: ["איטום", "בידוד", "זיפות"],
    docShortcuts: ERP_SHORTCUTS,
  },
  {
    id: "PAINTING",
    labelHe: "צבע ושליכט",
    icon: Paintbrush,
    keywords: ["צבע", "שליכט", "טיח", "שפכטל"],
    docShortcuts: ERP_SHORTCUTS,
  },
  {
    id: "GENERAL",
    labelHe: "כללי",
    icon: Box,
    keywords: [],
    docShortcuts: [...ERP_SHORTCUTS, { docType: "RECEIPT", labelHe: "קבלה" }],
  },
];

/** @deprecated Use getProjectSubDomainsForIndustry */
export const PROJECT_SUB_DOMAINS = CONSTRUCTION_PROJECT_SUB_DOMAINS;

export function getProjectSubDomainsForIndustry(industryRaw?: string | null): ProjectSubDomain[] {
  if (isCompanyMgmtIndustry(industryRaw)) {
    return BUSINESS_PROJECT_SUB_DOMAINS;
  }
  return CONSTRUCTION_PROJECT_SUB_DOMAINS;
}

export function getProjectSubDomainById(
  id: ProjectSubDomainId,
  industryRaw?: string | null,
): ProjectSubDomain | undefined {
  const list = getProjectSubDomainsForIndustry(industryRaw);
  return list.find((d) => d.id === id);
}

export const PROJECT_SUB_DOMAIN_BY_ID = Object.fromEntries(
  [...CONSTRUCTION_PROJECT_SUB_DOMAINS, ...BUSINESS_PROJECT_SUB_DOMAINS].map((d) => [d.id, d]),
) as Record<ProjectSubDomainId, ProjectSubDomain>;

export function guessSubDomainFromText(
  text: string,
  industryRaw?: string | null,
): ProjectSubDomainId | null {
  const lower = text.toLowerCase();
  const domains = getProjectSubDomainsForIndustry(industryRaw);
  for (const domain of domains) {
    if (domain.id === "GENERAL") continue;
    if (domain.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return domain.id;
    }
  }
  return null;
}

export function isConstructionSubDomainId(id: string): id is ConstructionSubDomainId {
  return (CONSTRUCTION_PROJECT_SUB_DOMAINS as ProjectSubDomain[]).some((d) => d.id === id);
}

export function defaultSubDomainForIndustry(_industryRaw?: string | null): ProjectSubDomainId {
  return "GENERAL";
}


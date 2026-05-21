import type { MessageTree } from "@/lib/i18n/keys";
import {
  INDUSTRY_CONFIGS,
  normalizeIndustryType,
  type IndustryConfig,
  type IndustryType,
} from "@/lib/professions/config";
export const BUSINESS_LINE_IDS = [
  "GENERAL_BUSINESS",
  "SERVICES",
  "TECH",
  "TRADE",
  "AGENCY",
  "HOLDING",
] as const;

export type BusinessLineId = (typeof BUSINESS_LINE_IDS)[number];

const LABELS_HE: Record<BusinessLineId, string> = {
  GENERAL_BUSINESS: "עסק כללי / חברה",
  SERVICES: "שירותים מקצועיים",
  TECH: "טכנולוגיה / מוצר",
  TRADE: "מסחר / יבוא",
  AGENCY: "סוכנות / שיווק",
  HOLDING: "החזקה / קבוצה",
};

type BusinessLinePatch = {
  scanner?: Partial<IndustryConfig["scanner"]> & {
    analysisTypes?: IndustryConfig["scanner"]["analysisTypes"];
    resultColumns?: IndustryConfig["scanner"]["resultColumns"];
  };
  aiInstructionsSuffix?: string;
  vocabulary?: Partial<IndustryConfig["vocabulary"]>;
  profile?: {
    clientsLabel: string;
    documentsLabel: string;
    recordsLabel: string;
    homeTitle: string;
    homeDescription: string;
    templates: Array<{
      id: string;
      label: string;
      description: string;
      kind: "OFFICIAL" | "APPROVAL" | "FORM" | "REPORT";
      issuedDocumentType?: "INVOICE" | "RECEIPT" | "INVOICE_RECEIPT" | "CREDIT_NOTE";
    }>;
  };
};

const LINE_PATCHES: Record<BusinessLineId, BusinessLinePatch | null> = {
  GENERAL_BUSINESS: null,
  SERVICES: {
    vocabulary: {
      client: "לקוח / מזמין שירות",
      project: "פרויקט שירות",
      document: "הצעה, חוזה ודוח ביצוע",
    },
    aiInstructionsSuffix: "Emphasize service delivery, milestones, and client billing.",
  },
  TECH: {
    vocabulary: {
      client: "לקוח / משקיע",
      project: "מוצר / ספרינט",
      document: "מפרט, הצעה וחוזה SaaS",
    },
    scanner: {
      subtitle: "חוזי SaaS, הצעות מחיר וחשבוניות מנוי",
    },
    aiInstructionsSuffix: "Focus on software/SaaS contracts, subscriptions, and deliverables.",
  },
  TRADE: {
    vocabulary: {
      client: "לקוח / ספק",
      project: "הזמנה / קו מוצר",
      document: "חשבונית רכש / מכירה",
      inventory: "מלאי ומחסן",
    },
    aiInstructionsSuffix: "Focus on purchase orders, inventory, and supplier invoices.",
  },
  AGENCY: {
    vocabulary: {
      client: "לקוח פרסום / מותג",
      project: "קמפיין / ריטיינר",
      document: "בריף, הצעה ודוח ביצוע",
    },
    aiInstructionsSuffix: "Focus on campaigns, retainers, and marketing deliverables.",
  },
  HOLDING: {
    vocabulary: {
      client: "חברה בנות / יזם",
      project: "יוזמה קבוצתית",
      document: "דוח הנהלה / אישור קבוצה",
    },
    aiInstructionsSuffix: "Focus on group reporting, approvals, and multi-entity context.",
  },
};

export function normalizeBusinessLine(raw?: string | null): BusinessLineId {
  const key = String(raw ?? "GENERAL_BUSINESS")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
  if ((BUSINESS_LINE_IDS as readonly string[]).includes(key)) {
    return key as BusinessLineId;
  }
  if (key === "GENERAL" || key === "GENERAL_CONTRACTOR") {
    return "GENERAL_BUSINESS";
  }
  return "GENERAL_BUSINESS";
}

export function businessLineLabelHe(line: BusinessLineId): string {
  return LABELS_HE[line] ?? LABELS_HE.GENERAL_BUSINESS;
}

export function mergeCompanyMgmtIndustryConfig(
  lineRaw?: string | null,
  _localeMessages?: MessageTree | null,
): IndustryConfig {
  const base = INDUSTRY_CONFIGS.COMPANY_MGMT;
  const line = normalizeBusinessLine(lineRaw);
  const patch = LINE_PATCHES[line];
  if (!patch) {
    return base;
  }
  const vocabulary = { ...base.vocabulary, ...(patch.vocabulary ?? {}) };
  const scanner = {
    ...base.scanner,
    ...patch.scanner,
    analysisTypes: patch.scanner?.analysisTypes ?? base.scanner.analysisTypes,
    resultColumns: patch.scanner?.resultColumns ?? base.scanner.resultColumns,
  };
  return {
    ...base,
    vocabulary,
    scanner,
    aiInstructions: patch.aiInstructionsSuffix
      ? `${base.aiInstructions} ${patch.aiInstructionsSuffix}`
      : base.aiInstructions,
  };
}

export type BusinessLineProfileOverlay = NonNullable<BusinessLinePatch["profile"]>;

export function getBusinessLineProfileOverlay(lineRaw?: string | null): BusinessLineProfileOverlay | null {
  const line = normalizeBusinessLine(lineRaw);
  if (line === "GENERAL_BUSINESS") {
    return null;
  }
  const patch = LINE_PATCHES[line];
  return patch?.profile ?? null;
}

export function isCompanyMgmtIndustry(industryRaw?: string | null): boolean {
  return normalizeIndustryType(industryRaw) === "COMPANY_MGMT";
}

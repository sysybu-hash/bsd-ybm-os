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
    scanner: {
      resultColumns: [
        { key: "service_description", label: "תיאור שירות" },
        { key: "milestone", label: "אבן דרך / שלב" },
        { key: "hours_or_days", label: "שעות / ימים" },
        { key: "hourly_rate", label: "תעריף שעתי (₪)" },
        { key: "milestone_amount", label: "סכום אבן דרך" },
        { key: "due_date", label: "תאריך יעד" },
      ],
    },
    aiInstructionsSuffix:
      "Extract professional service billing with full detail. Identify: service_description (exact wording), milestone_name or phase_name if present, hours_count and hourly_rate or day_rate, milestone_amount, payment_schedule (dates and amounts), retainer_amount_monthly if applicable, expense_reimbursements itemized, project_manager_name, contract_start_date and end_date, deliverable_list. Distinguish recurring retainer from project-based billing. For time-and-materials: extract each session/date separately.",
  },
  TECH: {
    vocabulary: {
      client: "לקוח / משקיע",
      project: "מוצר / ספרינט",
      document: "מפרט, הצעה וחוזה SaaS",
    },
    scanner: {
      subtitle: "חוזי SaaS, הצעות מחיר וחשבוניות מנוי",
      resultColumns: [
        { key: "product_name", label: "שם מוצר / מודול" },
        { key: "license_type", label: "סוג רישיון (seat/org/API)" },
        { key: "quantity", label: "כמות משתמשים / calls" },
        { key: "unit_price", label: "מחיר ליחידה / חודש" },
        { key: "subscription_period", label: "תקופת מנוי" },
        { key: "overage_charges", label: "חיובי עודף" },
      ],
    },
    aiInstructionsSuffix:
      "Extract SaaS/tech billing with precision. Identify: product_name and module/tier (e.g. Starter/Pro/Enterprise), license_type (per-seat/per-org/API-calls/storage-GB), quantity and unit_price, billing_period (monthly/annual), subscription_start_date and renewal_date, discount_percent and discount_reason, overage_charges (extra usage beyond plan), setup_fee, implementation_services_amount, support_tier, auto-renewal clause (yes/no). Separate one-time fees from recurring. For API invoices: extract call_volume and per-call rate.",
  },
  TRADE: {
    vocabulary: {
      client: "לקוח / ספק",
      project: "הזמנה / קו מוצר",
      document: "חשבונית רכש / מכירה",
      inventory: "מלאי ומחסן",
    },
    scanner: {
      resultColumns: [
        { key: "sku", label: "מק\"ט / ברקוד" },
        { key: "product_description", label: "תיאור מוצר" },
        { key: "quantity", label: "כמות" },
        { key: "unit", label: "יחידה (יח'/ק\"ג/מ'" },
        { key: "unit_price", label: "מחיר ליחידה" },
        { key: "supplier_ref", label: "מספר הזמנת ספק" },
      ],
    },
    aiInstructionsSuffix:
      "Extract trade/inventory purchase data with full SKU detail. For each line item: sku or barcode, product_description (Hebrew), quantity, unit (יחידה/ק\"ג/ליטר/קרטון/פלטה/מטר), unit_price, line_total. Also capture: supplier_po_number, delivery_date or requested_date, warehouse_destination, payment_terms (e.g. שוטף+30), currency if not ILS, customs_declaration_number for imports, country_of_origin, import_tax_amount, freight_cost. For delivery notes: match SKU to PO line, note quantity_received vs quantity_ordered, condition (תקין/פגום), receiver_signature.",
  },
  AGENCY: {
    vocabulary: {
      client: "לקוח פרסום / מותג",
      project: "קמפיין / ריטיינר",
      document: "בריף, הצעה ודוח ביצוע",
    },
    scanner: {
      resultColumns: [
        { key: "campaign_name", label: "שם קמפיין" },
        { key: "channel", label: "ערוץ (Meta/Google/OOH)" },
        { key: "budget_amount", label: "תקציב מדיה" },
        { key: "retainer_amount", label: "ריטיינר חודשי" },
        { key: "production_cost", label: "עלות הפקה" },
        { key: "period", label: "תקופת פעילות" },
      ],
    },
    aiInstructionsSuffix:
      "Extract marketing/agency billing with campaign granularity. Identify: campaign_name, channel or platform (Meta Ads/Google Ads/LinkedIn/OOH/TV/Radio/SEO), media_budget and agency_commission_percent, retainer_amount_monthly and included_services list, production_cost itemized (photography/video/design/copywriting), period (start_date to end_date), deliverables (number of creatives/posts/reports), performance_metrics if mentioned (impressions/clicks/ROAS), client_brand_name, account_manager_name. Distinguish media spend from agency fee.",
  },
  HOLDING: {
    vocabulary: {
      client: "חברה בנות / יזם",
      project: "יוזמה קבוצתית",
      document: "דוח הנהלה / אישור קבוצה",
    },
    scanner: {
      resultColumns: [
        { key: "entity_name", label: "שם ישות / חברה בת" },
        { key: "cost_center", label: "מרכז עלות / תקציב" },
        { key: "intercompany_amount", label: "עסקה בין-חברתית" },
        { key: "approval_level", label: "רמת אישור" },
        { key: "reporting_period", label: "תקופת דיווח" },
        { key: "currency", label: "מטבע" },
      ],
    },
    aiInstructionsSuffix:
      "Extract holding/group company documents with inter-entity precision. Identify: entity_name (legal company name), cost_center or budget_code, intercompany_transaction_amount and counterparty_entity, approval_authority_level (CEO/CFO/Board), reporting_period (quarter/year), currency and exchange_rate if non-ILS, consolidation_adjustments if visible. For management reports: extract KPI table (revenue/EBITDA/headcount per entity), variance_vs_budget_percent. For board approvals: resolution_number, approval_date, authorized_signatory. Distinguish operational from financing transactions.",
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

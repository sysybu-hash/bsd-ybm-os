import { isCompanyMgmtIndustry } from "@/lib/business-lines";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";

export type ScanModeUiOption = { id: ScanModeV5; label: string };

const CONSTRUCTION_SCAN_MODES: ScanModeUiOption[] = [
  { id: "INVOICE_FINANCIAL", label: "חשבונית / כספי" },
  { id: "DRAWING_BOQ", label: "גרמושקה / כתב כמויות" },
  { id: "QUOTE_BOQ", label: "הצעת מחיר" },
  { id: "PROGRESS_BILL", label: "חשבון חלקי" },
  { id: "SITE_LOG", label: "יומן שטח" },
  { id: "DELIVERY_NOTE", label: "תעודת משלוח" },
  { id: "PURCHASE_ORDER", label: "הזמנת רכש (PO)" },
  { id: "CONTRACT", label: "חוזה / הסכם" },
  { id: "GENERAL_DOCUMENT", label: "מסמך כללי" },
];

const COMPANY_SCAN_MODES: ScanModeUiOption[] = [
  { id: "INVOICE_FINANCIAL", label: "חשבונית / כספי" },
  { id: "PAYSLIP", label: "תלוש שכר" },
  { id: "BANK_STATEMENT", label: "תדפיס בנק" },
  { id: "DELIVERY_NOTE", label: "תעודת משלוח" },
  { id: "PURCHASE_ORDER", label: "הזמנת רכש (PO)" },
  { id: "CONTRACT", label: "חוזה / הסכם" },
  { id: "GENERAL_DOCUMENT", label: "מסמך כללי" },
];

// All modes — for company-mgmt clamp
const ALL_SCAN_MODES = new Set<ScanModeV5>([
  "INVOICE_FINANCIAL", "DRAWING_BOQ", "QUOTE_BOQ", "PROGRESS_BILL", "SITE_LOG",
  "PAYSLIP", "BANK_STATEMENT", "DELIVERY_NOTE", "PURCHASE_ORDER", "CONTRACT",
  "GENERAL_DOCUMENT",
]);

export function getScanModesForUi(industryRaw?: string | null): ScanModeUiOption[] {
  return isCompanyMgmtIndustry(industryRaw) ? COMPANY_SCAN_MODES : CONSTRUCTION_SCAN_MODES;
}

export function defaultScanModeForIndustry(industryRaw?: string | null): ScanModeV5 {
  return "INVOICE_FINANCIAL";
}

/** מצבים שאסורים לענף עסקי (למניעת AUTO שמסווג ל-BOQ) */
export function clampScanModeForIndustry(
  mode: ScanModeV5,
  industryRaw?: string | null,
): ScanModeV5 {
  // If mode is unknown / not in our set — fall back to GENERAL_DOCUMENT
  if (!ALL_SCAN_MODES.has(mode)) return "GENERAL_DOCUMENT";
  if (!isCompanyMgmtIndustry(industryRaw)) return mode;
  const allowed = new Set(COMPANY_SCAN_MODES.map((m) => m.id));
  return allowed.has(mode) ? mode : "GENERAL_DOCUMENT";
}

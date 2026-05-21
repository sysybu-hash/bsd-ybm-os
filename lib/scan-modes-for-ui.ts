import { isCompanyMgmtIndustry } from "@/lib/business-lines";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";

export type ScanModeUiOption = { id: ScanModeV5; label: string };

const CONSTRUCTION_SCAN_MODES: ScanModeUiOption[] = [
  { id: "INVOICE_FINANCIAL", label: "חשבונית / כספי" },
  { id: "DRAWING_BOQ", label: "גרמושקה / כתב כמויות" },
  { id: "QUOTE_BOQ", label: "הצעת מחיר" },
  { id: "PROGRESS_BILL", label: "חשבון חלקי" },
  { id: "SITE_LOG", label: "יומן שטח" },
];

const COMPANY_SCAN_MODES: ScanModeUiOption[] = [
  { id: "INVOICE_FINANCIAL", label: "חשבונית / כספי" },
  { id: "GENERAL_DOCUMENT", label: "חוזה / הצעה / דוח" },
];

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
  if (!isCompanyMgmtIndustry(industryRaw)) return mode;
  const allowed = new Set(COMPANY_SCAN_MODES.map((m) => m.id));
  return allowed.has(mode) ? mode : "GENERAL_DOCUMENT";
}

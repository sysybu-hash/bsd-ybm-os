import { clampScanModeForIndustry } from "@/lib/scan-modes-for-ui";
import { isCompanyMgmtIndustry } from "@/lib/business-lines";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";

export type ScanClassification = {
  scanMode: ScanModeV5;
  confidence: number;
  rationale: string;
  labels: string[];
};

const INVOICE_HINTS = /invoice|חשבונית|קבלה|receipt|tax|מע"מ|vat|ספק|supplier|total|סה"כ/i;
const DRAWING_HINTS = /drawing|תוכנית|boq|כמותיות|מפרט|plan|blueprint|cad|גוף בניין|קומה/i;
const QUOTE_HINTS = /הצעת\s*מחיר|quote|כתב\s*כמויות|price\s*offer/i;
const PROGRESS_HINTS = /חשבון\s*\d|progress|חלקי|אחוז\s*ביצוע|התקדמות/i;
const SITE_LOG_HINTS = /יומן|site\s*log|דוח\s*יום|יומן\s*עבודה|שטח/i;

const EXPLICIT_CLIENT_SCAN_MODES = new Set([
  "INVOICE_FINANCIAL",
  "DRAWING_BOQ",
  "QUOTE_BOQ",
  "PROGRESS_BILL",
  "SITE_LOG",
]);

export function isExplicitClientScanMode(scanMode: string): boolean {
  return EXPLICIT_CLIENT_SCAN_MODES.has(scanMode);
}

export function classifyScanDocumentHeuristic(input: {
  fileName: string;
  mimeType: string;
  userInstruction?: string | null;
  industry?: string | null;
}): ScanClassification {
  const name = input.fileName.toLowerCase();
  const mime = input.mimeType.toLowerCase();
  const instr = (input.userInstruction ?? "").toLowerCase();

  const finish = (scanMode: ScanModeV5, confidence: number, rationale: string, labels: string[]): ScanClassification => {
    const clamped = clampScanModeForIndustry(scanMode, input.industry);
    return {
      scanMode: clamped,
      confidence,
      rationale: clamped !== scanMode ? `${rationale}; clamped for company mgmt` : rationale,
      labels,
    };
  };

  if (isCompanyMgmtIndustry(input.industry)) {
    if (INVOICE_HINTS.test(instr) || /invoice|חשבונית|קבלה/.test(name)) {
      return finish("INVOICE_FINANCIAL", 0.85, "heuristic: invoice (company)", ["invoice"]);
    }
    if (QUOTE_HINTS.test(instr) || /חוזה|contract|הצעה|proposal/.test(name)) {
      return finish("GENERAL_DOCUMENT", 0.78, "heuristic: business contract/quote", ["contract"]);
    }
    return finish("GENERAL_DOCUMENT", 0.55, "heuristic: default business document", ["default"]);
  }

  if (SITE_LOG_HINTS.test(instr) || SITE_LOG_HINTS.test(name)) {
    return finish("SITE_LOG",
      0.82,
      "heuristic: site log keywords",
      ["site_log"],
    );
  }

  if (QUOTE_HINTS.test(instr) || QUOTE_HINTS.test(name)) {
    return finish("QUOTE_BOQ", 0.8, "heuristic: quote/BOQ keywords", ["quote"]);
  }

  if (PROGRESS_HINTS.test(instr) || PROGRESS_HINTS.test(name)) {
    return finish("PROGRESS_BILL", 0.78, "heuristic: progress bill keywords", ["progress"]);
  }

  if (INVOICE_HINTS.test(instr) || /invoice|חשבונית|קבלה/.test(name)) {
    return finish("INVOICE_FINANCIAL", 0.85, "heuristic: invoice keywords", ["invoice"]);
  }

  if (DRAWING_HINTS.test(instr) || /plan|תוכנית|dwg|boq/.test(name)) {
    return finish("DRAWING_BOQ", 0.8, "heuristic: drawing/BOQ keywords", ["drawing"]);
  }

  if (mime.includes("image/") && !INVOICE_HINTS.test(instr)) {
    return finish("GENERAL_DOCUMENT", 0.55, "heuristic: image without invoice hints", ["image"]);
  }

  return finish("INVOICE_FINANCIAL", 0.5, "heuristic: default financial document", ["default"]);
}

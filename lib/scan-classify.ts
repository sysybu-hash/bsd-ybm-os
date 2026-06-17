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
// Step 7 — new document type hints
const PAYSLIP_HINTS = /תלוש|payslip|pay\s*slip|שכר\s*נטו|שכר\s*ברוטו|ניכויים|מעסיק/i;
const BANK_HINTS = /תדפיס\s*בנק|bank\s*statement|bank\s*account|חשבון\s*בנק|יתרה|תנועות/i;
const DELIVERY_HINTS = /תעודת\s*משלוח|delivery\s*note|ת"ח|תעודה\s*מס|פתק\s*אריזה/i;
const PO_HINTS = /הזמנת\s*רכש|purchase\s*order|\bP\.?O\.?\b|הזמנה\s*מס/i;
const CONTRACT_HINTS = /חוזה|הסכם|contract|agreement|התחייבות|צדדים/i;

const EXPLICIT_CLIENT_SCAN_MODES = new Set([
  "INVOICE_FINANCIAL",
  "DRAWING_BOQ",
  "QUOTE_BOQ",
  "PROGRESS_BILL",
  "SITE_LOG",
  "PAYSLIP",
  "BANK_STATEMENT",
  "DELIVERY_NOTE",
  "PURCHASE_ORDER",
  "CONTRACT",
]);

export function isExplicitClientScanMode(scanMode: string): boolean {
  return EXPLICIT_CLIENT_SCAN_MODES.has(scanMode);
}

/** האם להריץ סיווג סוג מסמך (הוריסטיקה + AI) לפני החילוץ */
export function shouldAutoClassifyDocumentType(input: {
  scanMode: ScanModeV5;
  engineRunMode: string;
  docTypeAutoDetect: boolean;
}): boolean {
  if (isExplicitClientScanMode(input.scanMode)) return false;
  return input.docTypeAutoDetect || input.engineRunMode === "AUTO";
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

  // Step 7 — new document types (high confidence on explicit keywords)
  if (PAYSLIP_HINTS.test(instr) || PAYSLIP_HINTS.test(name)) {
    return finish("PAYSLIP", 0.88, "heuristic: payslip keywords", ["payslip"]);
  }
  if (BANK_HINTS.test(instr) || BANK_HINTS.test(name)) {
    return finish("BANK_STATEMENT", 0.85, "heuristic: bank statement keywords", ["bank"]);
  }
  if (DELIVERY_HINTS.test(instr) || DELIVERY_HINTS.test(name)) {
    return finish("DELIVERY_NOTE", 0.85, "heuristic: delivery note keywords", ["delivery"]);
  }
  if (PO_HINTS.test(instr) || PO_HINTS.test(name)) {
    return finish("PURCHASE_ORDER", 0.85, "heuristic: purchase order keywords", ["po"]);
  }
  if (CONTRACT_HINTS.test(instr) || CONTRACT_HINTS.test(name)) {
    return finish("CONTRACT", 0.82, "heuristic: contract keywords", ["contract"]);
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

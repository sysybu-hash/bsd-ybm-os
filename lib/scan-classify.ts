import type { ScanModeV5 } from "@/lib/scan-schema-v5";

export type ScanClassification = {
  scanMode: ScanModeV5;
  confidence: number;
  rationale: string;
  labels: string[];
};

const INVOICE_HINTS = /invoice|חשבונית|קבלה|receipt|tax|מע"מ|vat|ספק|supplier|total|סה"כ/i;
const DRAWING_HINTS = /drawing|תוכנית|boq|כמותיות|מפרט|plan|blueprint|cad|גוף בניין|קומה/i;

export function classifyScanDocumentHeuristic(input: {
  fileName: string;
  mimeType: string;
  userInstruction?: string | null;
}): ScanClassification {
  const name = input.fileName.toLowerCase();
  const mime = input.mimeType.toLowerCase();
  const instr = (input.userInstruction ?? "").toLowerCase();

  if (INVOICE_HINTS.test(instr) || /invoice|חשבונית|קבלה/.test(name)) {
    return {
      scanMode: "INVOICE_FINANCIAL",
      confidence: 0.85,
      rationale: "heuristic: invoice keywords",
      labels: ["invoice"],
    };
  }

  if (DRAWING_HINTS.test(instr) || /plan|תוכנית|dwg|boq/.test(name)) {
    return {
      scanMode: "DRAWING_BOQ",
      confidence: 0.8,
      rationale: "heuristic: drawing/BOQ keywords",
      labels: ["drawing"],
    };
  }

  if (mime.includes("image/") && !INVOICE_HINTS.test(instr)) {
    return {
      scanMode: "GENERAL_DOCUMENT",
      confidence: 0.55,
      rationale: "heuristic: image without invoice hints",
      labels: ["image"],
    };
  }

  return {
    scanMode: "INVOICE_FINANCIAL",
    confidence: 0.5,
    rationale: "heuristic: default financial document",
    labels: ["default"],
  };
}

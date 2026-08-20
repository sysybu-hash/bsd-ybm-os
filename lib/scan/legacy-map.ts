import type { ScanModeV5 } from "@/lib/scan-schema-v5";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";

/** ממפה analysisType ישן (תור/legacy) ל-ScanModeV5 */
export function mapLegacyAnalysisTypeToScanMode(analysisType: string): ScanModeV5 {
  const t = analysisType.toUpperCase();
  if (/INVOICE|חשבונית|RECEIPT|קבלה|EXPENSE|FINANCIAL/.test(t)) return "INVOICE_FINANCIAL";
  if (/BOQ|BLUEPRINT|DRAWING|גרמושקה|כמויות/.test(t)) return "DRAWING_BOQ";
  if (/QUOTE|הצעת/.test(t)) return "QUOTE_BOQ";
  if (/PROGRESS|חשבון.?חלקי/.test(t)) return "PROGRESS_BILL";
  if (/SITE.?LOG|יומן/.test(t)) return "SITE_LOG";
  if (/PAYSLIP|תלוש/.test(t)) return "PAYSLIP";
  if (/BANK|בנק/.test(t)) return "BANK_STATEMENT";
  if (/DELIVERY|משלוח/.test(t)) return "DELIVERY_NOTE";
  if (/PURCHASE|PO|הזמנת/.test(t)) return "PURCHASE_ORDER";
  if (/CONTRACT|חוזה/.test(t)) return "CONTRACT";
  return "GENERAL_DOCUMENT";
}

/** ממפה provider ישן ל-engineRunMode */
export function mapLegacyProviderToEngineRunMode(provider: string): TriEngineRunMode {
  const p = provider.toLowerCase();
  if (p === "docai" || p === "documentai") return "SINGLE_DOCUMENT_AI";
  if (p === "openai" || p === "gpt") return "SINGLE_OPENAI";
  if (p === "anthropic" || p === "claude") return "SINGLE_ANTHROPIC";
  if (p === "mistral" || p === "pixtral") return "SINGLE_MISTRAL";
  if (p === "multi") return "MULTI_PARALLEL";
  return "SINGLE_GEMINI";
}

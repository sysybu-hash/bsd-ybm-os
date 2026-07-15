import { enrichInvoiceV5 } from "@/lib/tri-engine-merge";
import {
  type ScanExtractionV5,
  type ScanModeV5,
  v5ToPersistableAiData,
} from "@/lib/scan-schema-v5";
import type { TriEngineResult, TriEngineTelemetry } from "@/lib/tri-engine-types";

export function finalizeFinancialV5(v5: ScanExtractionV5, scanMode: ScanModeV5): ScanExtractionV5 {
  if (scanMode === "INVOICE_FINANCIAL" || scanMode === "PROGRESS_BILL") {
    return enrichInvoiceV5(v5);
  }
  return v5;
}

export function packTriEngineResult(
  v5: ScanExtractionV5,
  scanMode: ScanModeV5,
  telemetry: TriEngineTelemetry,
): TriEngineResult {
  const finalized = finalizeFinancialV5(v5, scanMode);
  const aiData = v5ToPersistableAiData(finalized);
  aiData._triEngineTelemetry = telemetry;
  return { aiData, v5: finalized, telemetry };
}

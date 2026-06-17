import { validateScanV5, buildRetryInstruction, type ScanValidationResult } from "@/lib/scan-validate";
import { isPlaceholderVendor } from "@/lib/scan/v5-normalize";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import { runTriEngineExtraction } from "@/lib/tri-engine-extract";
import type { TriEngineResult } from "@/lib/tri-engine-types";

function financialFieldScore(v5: ScanExtractionV5): number {
  let score = 0;
  if (v5.vendor && !isPlaceholderVendor(v5.vendor)) score += 3;
  if (Number.isFinite(v5.total) && v5.total > 0) score += 3;
  if (v5.taxId?.trim()) score += 1;
  if (v5.date) score += 1;
  if (v5.lineItems.length > 0) score += 1;
  return score;
}

function shouldPreferRetryResult(
  original: ScanValidationResult,
  originalV5: ScanExtractionV5,
  retry: ScanValidationResult,
  retryV5: ScanExtractionV5,
): boolean {
  const originalFields = financialFieldScore(originalV5);
  const retryFields = financialFieldScore(retryV5);
  if (retryFields > originalFields) return true;
  if (retryFields < originalFields) return false;

  const originalErrors = original.issues.filter((i) => i.severity === "error").length;
  const retryErrors = retry.issues.filter((i) => i.severity === "error").length;
  if (retryErrors < originalErrors) return true;
  if (retryErrors > originalErrors) return false;

  const originalWarnings = original.issues.filter((i) => i.severity === "warning").length;
  const retryWarnings = retry.issues.filter((i) => i.severity === "warning").length;
  if (retryWarnings < originalWarnings) return true;
  if (retryWarnings > originalWarnings) return false;

  return retry.confidence > original.confidence;
}

/**
 * עוטף את runTriEngineExtraction עם שכבת אימות:
 * retry ממוקד אחד למסמכים פיננסיים עם בעיות sanity.
 */
export async function runTriEngineExtractionValidated(
  params: Parameters<typeof runTriEngineExtraction>[0],
): Promise<TriEngineResult> {
  const result = await runTriEngineExtraction(params);
  const validation = validateScanV5(result.v5);

  const isFinancial =
    params.scanMode === "INVOICE_FINANCIAL" || params.scanMode === "PROGRESS_BILL";
  const hasFixableIssues = validation.issues.some((i) => i.severity !== "info");
  const alreadyRetried = params.engineRunMode === "SINGLE_GEMINI";

  if (isFinancial && hasFixableIssues && !alreadyRetried) {
    const retryInstruction = buildRetryInstruction(validation.issues);
    if (retryInstruction) {
      try {
        const retry = await runTriEngineExtraction({
          ...params,
          engineRunMode: "SINGLE_GEMINI",
          userInstruction: [params.userInstruction?.trim(), retryInstruction]
            .filter(Boolean)
            .join("\n\n"),
        });
        const retryValidation = validateScanV5(retry.v5);
        if (shouldPreferRetryResult(validation, result.v5, retryValidation, retry.v5)) {
          const aiData = { ...retry.aiData, _validation: retryValidation, _validationRetried: true };
          return { ...retry, validation: retryValidation, aiData };
        }
      } catch {
        // retry נכשל — נשמור את התוצאה המקורית עם האזהרות
      }
    }
  }

  const aiData = { ...result.aiData, _validation: validation };
  return { ...result, validation, aiData };
}

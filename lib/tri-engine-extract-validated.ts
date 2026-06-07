import { validateScanV5, buildRetryInstruction } from "@/lib/scan-validate";
import { runTriEngineExtraction } from "@/lib/tri-engine-extract";
import type { TriEngineResult } from "@/lib/tri-engine-types";

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
        if (retryValidation.confidence > validation.confidence) {
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

/**
 * למידה מתיקונים — שלב 9ב באפיון.
 *
 * מסתכל על ה-AICorrection records האחרונים של הארגון ובונה few-shot examples
 * שמוזרקים לפרומפט ה-AI. כך המודל לומד מהתיקונים הספציפיים של הארגון
 * (למשל: "הספק הזה תמיד נקרא X ולא Y").
 */
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("scan-corrections-prompt");

/** מספר מקסימלי של תיקונים לשלב */
const MAX_EXAMPLES = 5;
/** ימים אחרונים לכלול */
const LOOKBACK_DAYS = 90;

export type CorrectionExample = {
  field: string;
  original: string;
  corrected: string;
};

/**
 * מחלץ דוגמאות תיקון לאחרונות מ-AICorrection של הארגון.
 */
export async function getRecentCorrectionExamples(
  organizationId: string,
): Promise<CorrectionExample[]> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

    const records = await prisma.aICorrection.findMany({
      where: {
        organizationId,
        correctionSource: "USER_MANUAL",
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_EXAMPLES * 3, // fetch more, filter to useful ones
      select: { originalAiData: true, correctedData: true },
    });

    const examples: CorrectionExample[] = [];
    const FIELDS = ["vendor", "taxId", "total", "date", "docType"] as const;

    for (const record of records) {
      if (examples.length >= MAX_EXAMPLES) break;
      const orig = record.originalAiData as Record<string, unknown> | null;
      const corr = record.correctedData as Record<string, unknown> | null;
      if (!orig || !corr) continue;

      for (const field of FIELDS) {
        const o = orig[field];
        const c = corr[field];
        if (o == null || c == null) continue;
        if (String(o) === String(c)) continue;
        // Only short/non-sensitive values
        const os = String(o).slice(0, 60);
        const cs = String(c).slice(0, 60);
        if (!os || !cs) continue;
        examples.push({ field, original: os, corrected: cs });
        break; // one correction per record
      }
    }

    return examples;
  } catch (err: unknown) {
    log.warn("failed to load correction examples", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * בונה בלוק few-shot לפרומפט ה-AI מתוך תיקונים קודמים של הארגון.
 * מוחזר רק אם יש תיקונים — string ריק אם לא.
 */
export function buildCorrectionPromptBlock(examples: CorrectionExample[]): string {
  if (!examples.length) return "";
  const lines = examples.map(
    (ex) => `  - Field "${ex.field}": AI said "${ex.original}" → user corrected to "${ex.corrected}"`,
  );
  return [
    "### ORGANIZATION CORRECTIONS (learn from past mistakes)",
    "This organization previously corrected these AI extraction errors.",
    "Apply this knowledge when similar data appears:",
    ...lines,
    "",
  ].join("\n");
}

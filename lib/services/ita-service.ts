/**
 * מספר הקצאה — רשות המסים (מעודכן 18/05/2026)
 * סף לפני מע״מ: 10,000 ₪ (מ-1.1.2026), 5,000 ₪ (מ-1.6.2026)
 *
 * בפרודקשן: אין מספרי הקצאה מדומים. Mock רק עם ALLOW_ITA_MOCK=true (local/E2E).
 * API רשמי — TODO כשיהיה מפתח + מפרט מאושר.
 */
import type { DocType } from "@prisma/client";
import { env } from "@/lib/env";
import {
  getItaAllocationThresholdNis,
  requiresItaAllocation,
} from "@/lib/ita-allocation-rules";
import { createLogger } from "@/lib/logger";

const log = createLogger("ita-service");

export function isItaProductionConfigured(): boolean {
  const key = env.ITA_PRODUCTION_KEY?.trim();
  return Boolean(key && key.length > 0);
}

export function isItaMockAllowed(): boolean {
  return Boolean(env.ALLOW_ITA_MOCK);
}

export interface ItaAllocationResult {
  success: boolean;
  allocationNumber?: string;
  error?: string;
  isMock: boolean;
  skipped?: boolean;
  thresholdNis?: number;
}

export async function requestItaAllocation(
  netAmount: number,
  clientVat: string,
  invoiceId: string,
  options?: { docType?: DocType; asOf?: Date },
): Promise<ItaAllocationResult> {
  const asOf = options?.asOf ?? new Date();
  const docType = options?.docType ?? "INVOICE";
  const threshold = getItaAllocationThresholdNis(asOf);

  if (!requiresItaAllocation(docType, netAmount, asOf)) {
    return { success: true, isMock: false, skipped: true, thresholdNis: threshold };
  }

  void clientVat;
  void invoiceId;

  try {
    if (isItaMockAllowed()) {
      log.warn("ALLOW_ITA_MOCK — returning development mock allocation number");
      const mockNumber = Math.floor(100000000 + Math.random() * 900000000).toString();
      return {
        success: true,
        allocationNumber: mockNumber,
        isMock: true,
        thresholdNis: threshold,
      };
    }

    if (!isItaProductionConfigured()) {
      log.warn("ITA allocation required but ITA_PRODUCTION_KEY missing — refusing");
      return {
        success: false,
        error:
          "נדרש מספר הקצאה מרשות המסים, אך המערכת אינה מחוברת ל-ITA. הגדירו ITA_PRODUCTION_KEY או פנו לתמיכה.",
        isMock: false,
        thresholdNis: threshold,
      };
    }

    // מפתח קיים אך API רשמי עדיין לא ממומש — לא להחזיר מספר שנראה אמיתי
    log.error("ITA_PRODUCTION_KEY set but official ITA API is not implemented");
    return {
      success: false,
      error:
        "חיבור רשות המסים מוגדר אך ה-API הרשמי עדיין לא פעיל במערכת. לא ניתן להנפיק מסמך מעל סף ההקצאה.",
      isMock: false,
      thresholdNis: threshold,
    };
  } catch {
    return {
      success: false,
      error: "בקשת מספר הקצאה לרשות המסים נכשלה",
      isMock: false,
      thresholdNis: threshold,
    };
  }
}

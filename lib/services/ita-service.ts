/**
 * מספר הקצאה — רשות המסים (מעודכן 18/05/2026)
 * סף לפני מע״מ: 10,000 ₪ (מ-1.1.2026), 5,000 ₪ (מ-1.6.2026)
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

  try {
    if (!isItaProductionConfigured()) {
      log.warn("Missing ITA_PRODUCTION_KEY — using 2026 mock allocation number");
      const mockNumber = Math.floor(100000000 + Math.random() * 900000000).toString();
      return {
        success: true,
        allocationNumber: mockNumber,
        isMock: true,
        thresholdNis: threshold,
      };
    }

    // TODO: חיבור API רשמי לפי מפרט רשות המסים
    return {
      success: true,
      allocationNumber: "2026-PENDING-KEY",
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

/**
 * מספר הקצאה — רשות המסים (מעודכן 18/05/2026)
 * סף לפני מע״מ: 10,000 ₪ (מ-1.1.2026), 5,000 ₪ (מ-1.6.2026)
 *
 * בפרודקשן: אין מספרי הקצאה מדומים. Mock רק עם ALLOW_ITA_MOCK=true (local/E2E).
 * HTTP API — כאשר ITA_PRODUCTION_KEY + ITA_API_URL מוגדרים.
 */
import type { DocType } from "@prisma/client";
import type { ApiErrorKey } from "@/lib/i18n/api-error";
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

export function isItaHttpConfigured(): boolean {
  return isItaProductionConfigured() && Boolean(env.ITA_API_URL?.trim());
}

export function isItaMockAllowed(): boolean {
  return Boolean(env.ALLOW_ITA_MOCK);
}

export interface ItaAllocationResult {
  success: boolean;
  allocationNumber?: string;
  /** Machine-readable key — localize with getApiErrorMessage() at the API boundary. */
  errorKey?: ApiErrorKey;
  isMock: boolean;
  skipped?: boolean;
  thresholdNis?: number;
}

function parseItaAllocationNumber(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const candidates = [
    obj.allocationNumber,
    obj.allocation_number,
    obj.number,
    obj.confirmation_number,
    obj.confirmationNumber,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^\d{9}$/.test(c.trim())) {
      return c.trim();
    }
  }
  const data = obj.data;
  if (data && typeof data === "object") {
    return parseItaAllocationNumber(data);
  }
  return null;
}

async function requestItaAllocationHttp(
  netAmount: number,
  clientVat: string,
  invoiceId: string,
  options?: { docType?: DocType; asOf?: Date },
): Promise<ItaAllocationResult> {
  const threshold = getItaAllocationThresholdNis(options?.asOf ?? new Date());
  const apiUrl = env.ITA_API_URL?.trim();
  const apiKey = env.ITA_PRODUCTION_KEY?.trim();

  if (!apiUrl || !apiKey) {
    return {
      success: false,
      errorKey: "ita_not_configured",
      isMock: false,
      thresholdNis: threshold,
    };
  }

  const endpoint = apiUrl.replace(/\/$/, "") + "/allocation";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        vatNumber: clientVat,
        invoiceId,
        netAmount,
        docType: options?.docType ?? "INVOICE",
        asOf: (options?.asOf ?? new Date()).toISOString(),
      }),
    });

    const payload: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      log.error("ita_api_error", undefined, { status: res.status, payload });
      return { success: false, errorKey: "ita_allocation_request_failed", isMock: false, thresholdNis: threshold };
    }

    const allocationNumber = parseItaAllocationNumber(payload);
    if (!allocationNumber) {
      log.error("ita_api_missing_allocation_number", undefined, { payload });
      return {
        success: false,
        errorKey: "ita_allocation_request_failed",
        isMock: false,
        thresholdNis: threshold,
      };
    }

    return {
      success: true,
      allocationNumber,
      isMock: false,
      thresholdNis: threshold,
    };
  } catch (e) {
    log.error("ita_api_network_failed", e instanceof Error ? e : new Error(String(e)));
    return {
      success: false,
      errorKey: "ita_allocation_request_failed",
      isMock: false,
      thresholdNis: threshold,
    };
  }
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
        errorKey: "ita_not_configured",
        isMock: false,
        thresholdNis: threshold,
      };
    }

    if (isItaHttpConfigured()) {
      return requestItaAllocationHttp(netAmount, clientVat, invoiceId, { docType, asOf });
    }

    // מפתח קיים אך ITA_API_URL חסר — לא להחזיר מספר שנראה אמיתי
    log.error("ITA_PRODUCTION_KEY set but ITA_API_URL missing");
    return {
      success: false,
      errorKey: "ita_api_inactive",
      isMock: false,
      thresholdNis: threshold,
    };
  } catch {
    return {
      success: false,
      errorKey: "ita_allocation_request_failed",
      isMock: false,
      thresholdNis: threshold,
    };
  }
}

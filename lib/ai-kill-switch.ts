import { env } from "@/lib/env";

/** P1 DR — כיבוי fallback/retry לכל מסלולי AI (סריקה + צ'אט). */
export const AI_SERVICE_UNAVAILABLE_CODE = "ai_service_unavailable";

export const AI_SERVICE_UNAVAILABLE_MESSAGE =
  "שירותי הבינה המלאכותית אינם זמינים כרגע. אנא נסו שוב מאוחר יותר.";

export function isAiFallbackDisabled(): boolean {
  return Boolean(env.DISABLE_AI_FALLBACK);
}

export type AiAvailability =
  | { ok: true }
  | { ok: false; message: string; code: typeof AI_SERVICE_UNAVAILABLE_CODE };

export function checkAiServicesAvailable(): AiAvailability {
  if (isAiFallbackDisabled()) {
    return {
      ok: false,
      message: AI_SERVICE_UNAVAILABLE_MESSAGE,
      code: AI_SERVICE_UNAVAILABLE_CODE,
    };
  }
  return { ok: true };
}

export class AiServiceUnavailableError extends Error {
  readonly code = AI_SERVICE_UNAVAILABLE_CODE;

  constructor(message = AI_SERVICE_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "AiServiceUnavailableError";
  }
}

/** זורק AiServiceUnavailableError כש-DISABLE_AI_FALLBACK=1 */
export function assertAiServicesAvailable(): void {
  const gate = checkAiServicesAvailable();
  if (!gate.ok) {
    throw new AiServiceUnavailableError(gate.message);
  }
}

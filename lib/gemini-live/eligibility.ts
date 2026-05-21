import type { OsAssistantUserContext } from "@/lib/os-assistant/user-context";

/** מזהה ארגון — JWT לפעמים בלי organizationId; הקשר מהשרת מלא יותר. */
export function resolveGeminiLiveOrgId(
  sessionOrgId: string | null | undefined,
  context: OsAssistantUserContext | null,
): string | null {
  const fromSession = sessionOrgId?.trim();
  if (fromSession) return fromSession;
  return context?.organization?.id?.trim() ?? null;
}

export function isGeminiLiveSessionEligible(params: {
  userId: string | null | undefined;
  orgId: string | null;
  platformEnabled?: boolean;
}): boolean {
  if (!params.userId?.trim() || !params.orgId) return false;
  if (params.platformEnabled === false) return false;
  return true;
}

/** אחרי טעינת `/api/os/assistant/context` — כיבוי מפורש מהשרת. */
export function isGeminiLiveAllowedByContext(context: OsAssistantUserContext | null): boolean {
  if (!context) return true;
  if (context.capabilities.geminiLive) return true;
  return Boolean(context.organization?.id);
}

export function isGeminiLiveContextReady(params: {
  assistantReady: boolean;
  assistantLoading: boolean;
  systemInstructionVoice: string;
  context: OsAssistantUserContext | null;
}): boolean {
  if (!params.assistantReady || params.assistantLoading) return false;
  if (
    params.context?.capabilities.geminiLive === false &&
    !params.context?.organization?.id
  ) {
    return false;
  }
  const voice = params.systemInstructionVoice.trim();
  if (voice.length < 120) return false;
  if (
    voice.startsWith("You are the BSD-YBM OS voice assistant (Gemini Live). Reply in")
  ) {
    return false;
  }
  return true;
}

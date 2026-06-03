/**
 * Helpers for delivering incremental transcript chunks to callers.
 * Extracted from hooks/useGeminiLiveAudio to keep the hook focused.
 */
import { getAssistantVisibleTranscript } from "@/lib/ai/filter-assistant-visible-text";

export function deliverModelTranscript(
  raw: string,
  deliveredRef: { current: string },
  onModelTranscript?: (text: string, finished: boolean) => void,
): void {
  const visible = getAssistantVisibleTranscript(raw);
  if (!visible || visible === deliveredRef.current) return;
  deliveredRef.current = visible;
  onModelTranscript?.(visible, true);
}

export function deliverUserTranscript(
  raw: string,
  deliveredRef: { current: string },
  onUserTranscript?: (text: string, finished: boolean) => void,
): void {
  const text = raw.trim();
  if (!text || text === deliveredRef.current) return;
  deliveredRef.current = text;
  onUserTranscript?.(text, true);
}

export function flushUserTranscriptTurn(
  latestUserTextRef: { current: string },
  deliveredUserTextRef: { current: string },
  onUserTranscript?: (text: string, finished: boolean) => void,
): void {
  const finalUser = latestUserTextRef.current.trim();
  if (finalUser) {
    deliverUserTranscript(finalUser, deliveredUserTextRef, onUserTranscript);
  }
  latestUserTextRef.current = "";
  deliveredUserTextRef.current = "";
}

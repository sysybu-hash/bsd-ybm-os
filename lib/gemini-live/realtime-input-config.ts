import type { RealtimeInputConfig, TurnCoverage } from "@google/genai";
import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { GEMINI_LIVE_TURN_COVERAGE } from "@/lib/gemini-live/api-constants";

/** VAD / פעילות קול — חייב להיות גם ב-auth token (ה-setup מהלקוח מוחלף בהגבלות הטוקן). */
export function buildRealtimeInputConfig(settings: GeminiLiveVoiceSettings): RealtimeInputConfig {
  return {
    automaticActivityDetection: {
      disabled: false,
      silenceDurationMs: settings.silenceDurationMs,
      prefixPaddingMs: settings.prefixPaddingMs,
    },
    turnCoverage: GEMINI_LIVE_TURN_COVERAGE.TURN_INCLUDES_ONLY_ACTIVITY as TurnCoverage,
  };
}

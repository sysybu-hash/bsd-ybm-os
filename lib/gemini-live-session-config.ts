import { Modality, type LiveConnectConfig } from "@google/genai";
import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { normalizeGeminiLiveVoiceSettings } from "@/lib/gemini-live-voice-settings";
import { getOsAssistantLiveToolDeclarations } from "@/lib/os-assistant/live-tools";

export type GeminiLiveSessionRequest = Partial<GeminiLiveVoiceSettings> & {
  geminiLiveAdvancedFeatures?: boolean;
};

export function liveModalitiesFromSettings(settings: GeminiLiveVoiceSettings): Modality[] {
  if (settings.responseMode === "audio_text") {
    return [Modality.AUDIO, Modality.TEXT];
  }
  return [Modality.AUDIO];
}

export function normalizeSessionRequest(body: unknown): {
  settings: GeminiLiveVoiceSettings;
  advancedFeatures: boolean;
} {
  const raw = body && typeof body === "object" ? (body as GeminiLiveSessionRequest) : {};
  const settings = normalizeGeminiLiveVoiceSettings(raw);
  return {
    settings,
    advancedFeatures: raw.geminiLiveAdvancedFeatures === true,
  };
}

export function buildLiveConnectConfig(settings: GeminiLiveVoiceSettings) {
  return {
    sessionResumption: {},
    temperature: settings.temperature,
    responseModalities: liveModalitiesFromSettings(settings),
  };
}

/** VAD / פעילות קול — חייב להיות גם ב-auth token (ה-setup מהלקוח מוחלף בהגבלות הטוקן). */
export function buildRealtimeInputConfig(settings: GeminiLiveVoiceSettings) {
  return {
    automaticActivityDetection: {
      disabled: false,
      silenceDurationMs: settings.silenceDurationMs,
      prefixPaddingMs: settings.prefixPaddingMs,
    },
    turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY" as const,
  };
}

/** תצורה מלאה ל-auth token — כולל הוראות מערכת וכלים (חובה ל-BidiGenerateContentConstrained) */
export function buildFullLiveConnectConfig(
  settings: GeminiLiveVoiceSettings,
  systemInstruction: string,
  options?: { advancedFeatures?: boolean },
): LiveConnectConfig {
  const base = buildLiveConnectConfig(settings);
  return {
    ...base,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    tools: [{ functionDeclarations: getOsAssistantLiveToolDeclarations() }],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: settings.voiceName },
      },
    },
    ...(options?.advancedFeatures && settings.affectiveDialog
      ? { enableAffectiveDialog: true }
      : {}),
    ...(settings.inputTranscription ? { inputAudioTranscription: {} } : {}),
    ...(settings.outputTranscription ? { outputAudioTranscription: {} } : {}),
    realtimeInputConfig: buildRealtimeInputConfig(settings),
    ...(options?.advancedFeatures && settings.proactiveAudio
      ? { proactivity: { proactiveAudio: true } }
      : {}),
  };
}

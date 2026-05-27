import { Modality, type LiveConnectConfig } from "@google/genai";
import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { GEMINI_LIVE_MODALITY } from "@/lib/gemini-live/api-constants";
import { buildRealtimeInputConfig } from "@/lib/gemini-live/realtime-input-config";
import { liveResponseModalityStringsForModel } from "@/lib/gemini-live/response-modalities";
import { normalizeGeminiLiveVoiceSettings } from "@/lib/gemini-live-voice-settings";
import { getOsAssistantLiveToolDeclarations } from "@/lib/os-assistant/live-tools";

export type GeminiLiveSessionRequest = Partial<GeminiLiveVoiceSettings> & {
  geminiLiveAdvancedFeatures?: boolean;
};

export { buildRealtimeInputConfig };

export function liveModalitiesFromSettings(
  settings: GeminiLiveVoiceSettings,
  model?: string,
): Modality[] {
  const strings = model
    ? liveResponseModalityStringsForModel(model, settings)
    : liveModalitiesStringsFromSettings(settings);
  return strings.map((value) => value as Modality);
}

/** ערכי modality כמחרוזות (לוג / בדיקות). */
export function liveModalitiesStringsFromSettings(
  settings: GeminiLiveVoiceSettings,
  model?: string,
): string[] {
  if (model) {
    return liveResponseModalityStringsForModel(model, settings);
  }
  if (settings.responseMode === "audio_text") {
    return [GEMINI_LIVE_MODALITY.AUDIO, GEMINI_LIVE_MODALITY.TEXT];
  }
  return [GEMINI_LIVE_MODALITY.AUDIO];
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

export function buildLiveConnectConfig(
  settings: GeminiLiveVoiceSettings,
  model?: string,
) {
  return {
    ...(settings.sessionResumptionEnabled ? { sessionResumption: {} } : {}),
    temperature: settings.temperature,
    responseModalities: liveModalitiesFromSettings(settings, model),
  };
}

/** תצורה מלאה ל-auth token — כולל הוראות מערכת וכלים (חובה ל-BidiGenerateContentConstrained) */
export function buildFullLiveConnectConfig(
  settings: GeminiLiveVoiceSettings,
  systemInstruction: string,
  options?: { advancedFeatures?: boolean; model?: string },
): LiveConnectConfig {
  const base = buildLiveConnectConfig(settings, options?.model);
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

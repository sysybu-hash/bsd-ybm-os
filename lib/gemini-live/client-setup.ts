import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { GEMINI_LIVE_MODALITY } from "@/lib/gemini-live/api-constants";
import { buildRealtimeInputConfig } from "@/lib/gemini-live/realtime-input-config";
import { getOsAssistantLiveToolDeclarations } from "@/lib/os-assistant/live-tools";

export type GeminiLiveClientSetupMessage = {
  setup: Record<string, unknown>;
};

export type BuildClientLiveSetupOptions = {
  model: string;
  systemInstruction: string;
  settings: GeminiLiveVoiceSettings;
  advancedFeaturesEnabled?: boolean;
  /** כשהטוקן כולל liveConnectConstraints — שליחת setup מינימלי בלבד */
  embeddedSetup?: boolean;
};

/** הודעת setup ל-WebSocket — תואמת ל-`LiveClientSetup` בלי תלות ב-SDK בדפדפן. */
export function buildClientLiveSetupMessage({
  model,
  systemInstruction,
  settings,
  advancedFeaturesEnabled = false,
  embeddedSetup = false,
}: BuildClientLiveSetupOptions): GeminiLiveClientSetupMessage {
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;

  if (embeddedSetup) {
    return { setup: { model: modelPath } };
  }

  const setup: Record<string, unknown> = {
    model: modelPath,
    generationConfig: {
      responseModalities:
        settings.responseMode === "audio_text"
          ? [GEMINI_LIVE_MODALITY.AUDIO, GEMINI_LIVE_MODALITY.TEXT]
          : [GEMINI_LIVE_MODALITY.AUDIO],
      temperature: settings.temperature,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: settings.voiceName },
        },
      },
      ...(advancedFeaturesEnabled && settings.affectiveDialog
        ? { enableAffectiveDialog: true }
        : {}),
    },
    systemInstruction: { parts: [{ text: systemInstruction }] },
    tools: [{ functionDeclarations: getOsAssistantLiveToolDeclarations() }],
    ...(settings.inputTranscription ? { inputAudioTranscription: {} } : {}),
    ...(settings.outputTranscription ? { outputAudioTranscription: {} } : {}),
    realtimeInputConfig: buildRealtimeInputConfig(settings),
  };

  if (advancedFeaturesEnabled && settings.proactiveAudio) {
    setup.proactivity = { proactiveAudio: true };
  }
  if (settings.sessionResumptionEnabled) {
    setup.sessionResumption = {};
  }

  return { setup };
}

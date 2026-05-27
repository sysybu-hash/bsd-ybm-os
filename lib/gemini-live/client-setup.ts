import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { buildRealtimeInputConfig } from "@/lib/gemini-live/realtime-input-config";
import {
  coalesceLiveVoiceSettingsForModel,
  liveResponseModalityStringsForModel,
} from "@/lib/gemini-live/response-modalities";
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
  const resolvedSettings = coalesceLiveVoiceSettingsForModel(settings, model);

  if (embeddedSetup) {
    return { setup: { model: modelPath } };
  }

  const setup: Record<string, unknown> = {
    model: modelPath,
    generationConfig: {
      responseModalities: liveResponseModalityStringsForModel(model, resolvedSettings),
      temperature: resolvedSettings.temperature,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: resolvedSettings.voiceName },
        },
      },
      ...(advancedFeaturesEnabled && resolvedSettings.affectiveDialog
        ? { enableAffectiveDialog: true }
        : {}),
    },
    systemInstruction: { parts: [{ text: systemInstruction }] },
    tools: [{ functionDeclarations: getOsAssistantLiveToolDeclarations() }],
    ...(resolvedSettings.inputTranscription ? { inputAudioTranscription: {} } : {}),
    ...(resolvedSettings.outputTranscription ? { outputAudioTranscription: {} } : {}),
    realtimeInputConfig: buildRealtimeInputConfig(resolvedSettings),
  };

  if (advancedFeaturesEnabled && resolvedSettings.proactiveAudio) {
    setup.proactivity = { proactiveAudio: true };
  }
  if (resolvedSettings.sessionResumptionEnabled) {
    setup.sessionResumption = {};
  }

  return { setup };
}

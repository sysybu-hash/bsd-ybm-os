import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { GEMINI_LIVE_MODALITY } from "@/lib/gemini-live/api-constants";

/** מודלי native-audio תומכים רק ב-AUDIO — לא AUDIO+TEXT יחד (טקסט דרך outputAudioTranscription). */
export function isNativeAudioLiveModel(model: string): boolean {
  const id = model.replace(/^models\//, "").toLowerCase();
  return id.includes("native-audio") || id.includes("native_audio");
}

export function liveResponseModalityStringsForModel(
  model: string,
  settings: GeminiLiveVoiceSettings,
): string[] {
  if (isNativeAudioLiveModel(model)) {
    return [GEMINI_LIVE_MODALITY.AUDIO];
  }
  if (settings.responseMode === "audio_text") {
    return [GEMINI_LIVE_MODALITY.AUDIO, GEMINI_LIVE_MODALITY.TEXT];
  }
  return [GEMINI_LIVE_MODALITY.AUDIO];
}

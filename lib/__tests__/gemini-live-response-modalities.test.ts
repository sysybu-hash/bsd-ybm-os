import { DEFAULT_GEMINI_LIVE_VOICE_SETTINGS } from "@/hooks/useGeminiLiveAudio";
import {
  isNativeAudioLiveModel,
  liveResponseModalityStringsForModel,
} from "@/lib/gemini-live/response-modalities";

describe("gemini-live response-modalities", () => {
  it("detects native-audio model ids", () => {
    expect(isNativeAudioLiveModel("gemini-2.5-flash-native-audio-latest")).toBe(true);
    expect(isNativeAudioLiveModel("models/gemini-2.5-flash-native-audio-preview-12-2025")).toBe(true);
    expect(isNativeAudioLiveModel("gemini-3.1-flash-live-preview")).toBe(false);
  });

  it("forces AUDIO-only for native-audio even when audio_text is requested", () => {
    expect(
      liveResponseModalityStringsForModel("gemini-2.5-flash-native-audio-latest", {
        ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
        responseMode: "audio_text",
      }),
    ).toEqual(["AUDIO"]);
  });

  it("allows AUDIO+TEXT for live preview models", () => {
    expect(
      liveResponseModalityStringsForModel("gemini-3.1-flash-live-preview", {
        ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
        responseMode: "audio_text",
      }),
    ).toEqual(["AUDIO", "TEXT"]);
  });
});

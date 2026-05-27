jest.mock("@google/genai", () => ({
  Modality: { AUDIO: "AUDIO", TEXT: "TEXT" },
}));

import {
  buildFullLiveConnectConfig,
  buildLiveConnectConfig,
  liveModalitiesFromSettings,
  normalizeSessionRequest,
} from "@/lib/gemini-live-session-config";
import { DEFAULT_GEMINI_LIVE_VOICE_SETTINGS } from "@/hooks/useGeminiLiveAudio";

describe("gemini-live-session-config", () => {
  it("maps audio_text to AUDIO+TEXT modalities for non-native models", () => {
    const mods = liveModalitiesFromSettings(
      {
        ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
        responseMode: "audio_text",
      },
      "gemini-3.1-flash-live-preview",
    );
    expect(mods).toEqual(["AUDIO", "TEXT"]);
  });

  it("maps audio_text to AUDIO only for native-audio models", () => {
    const mods = liveModalitiesFromSettings(
      {
        ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
        responseMode: "audio_text",
      },
      "gemini-2.5-flash-native-audio-latest",
    );
    expect(mods).toEqual(["AUDIO"]);
  });

  it("maps audio-only to AUDIO modality", () => {
    const mods = liveModalitiesFromSettings({
      ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
      responseMode: "audio",
    });
    expect(mods).toEqual(["AUDIO"]);
  });

  it("normalizes session body with advanced flag", () => {
    const { settings, advancedFeatures } = normalizeSessionRequest({
      responseMode: "audio_text",
      temperature: 0.4,
      geminiLiveAdvancedFeatures: true,
    });
    expect(settings.responseMode).toBe("audio_text");
    expect(settings.temperature).toBe(0.4);
    expect(advancedFeatures).toBe(true);
  });

  it("buildLiveConnectConfig includes temperature and session resumption when enabled", () => {
    const cfg = buildLiveConnectConfig({
      ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
      temperature: 0.55,
      sessionResumptionEnabled: true,
    });
    expect(cfg.temperature).toBe(0.55);
    expect(cfg.sessionResumption).toEqual({});
    expect(cfg.responseModalities).toEqual(["AUDIO", "TEXT"]);
  });

  it("buildLiveConnectConfig omits session resumption when disabled", () => {
    const cfg = buildLiveConnectConfig({
      ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
      sessionResumptionEnabled: false,
    });
    expect(cfg.sessionResumption).toBeUndefined();
  });

  it("buildFullLiveConnectConfig uses AUDIO-only and outputAudioTranscription for native audio_text", () => {
    const cfg = buildFullLiveConnectConfig(
      {
        ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
        responseMode: "audio_text",
        outputTranscription: false,
      },
      "You are BSD-YBM OS voice assistant.",
      { model: "gemini-2.5-flash-native-audio-latest" },
    );
    expect(cfg.responseModalities).toEqual(["AUDIO"]);
    expect(cfg.outputAudioTranscription).toEqual({});
  });

  it("buildFullLiveConnectConfig embeds system instruction and tools", () => {
    const cfg = buildFullLiveConnectConfig(
      DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
      "You are BSD-YBM OS voice assistant.",
    );
    expect(cfg.systemInstruction).toEqual({
      parts: [{ text: "You are BSD-YBM OS voice assistant." }],
    });
    const firstTool = cfg.tools?.[0];
    const decls =
      firstTool && "functionDeclarations" in firstTool
        ? firstTool.functionDeclarations
        : undefined;
    expect(decls?.length).toBeGreaterThan(0);
    expect(cfg.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe("Charon");
    expect(cfg.realtimeInputConfig).toEqual({
      automaticActivityDetection: {
        disabled: false,
        silenceDurationMs: DEFAULT_GEMINI_LIVE_VOICE_SETTINGS.silenceDurationMs,
        prefixPaddingMs: DEFAULT_GEMINI_LIVE_VOICE_SETTINGS.prefixPaddingMs,
      },
      turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
    });
  });
});

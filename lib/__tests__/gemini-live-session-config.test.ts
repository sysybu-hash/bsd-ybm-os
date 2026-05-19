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
  it("maps audio_text to AUDIO+TEXT modalities", () => {
    const mods = liveModalitiesFromSettings({
      ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
      responseMode: "audio_text",
    });
    expect(mods).toEqual(["AUDIO", "TEXT"]);
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

  it("buildLiveConnectConfig includes temperature and session resumption", () => {
    const cfg = buildLiveConnectConfig({
      ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
      temperature: 0.55,
    });
    expect(cfg.temperature).toBe(0.55);
    expect(cfg.sessionResumption).toEqual({});
    expect(cfg.responseModalities).toEqual(["AUDIO"]);
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
  });
});

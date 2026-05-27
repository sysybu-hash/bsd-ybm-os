import { DEFAULT_GEMINI_LIVE_VOICE_SETTINGS } from "@/hooks/useGeminiLiveAudio";
import { buildClientLiveSetupMessage } from "@/lib/gemini-live/client-setup";
import { buildRealtimeInputConfig } from "@/lib/gemini-live/realtime-input-config";

describe("gemini-live client setup", () => {
  it("buildRealtimeInputConfig uses string turnCoverage without SDK enums", () => {
    const cfg = buildRealtimeInputConfig(DEFAULT_GEMINI_LIVE_VOICE_SETTINGS);
    expect(cfg.turnCoverage).toBe("TURN_INCLUDES_ONLY_ACTIVITY");
  });

  it("embedded setup sends model only", () => {
    const msg = buildClientLiveSetupMessage({
      model: "gemini-2.5-flash-native-audio-latest",
      systemInstruction: "test",
      settings: DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
      embeddedSetup: true,
    });
    expect(msg.setup).toEqual({
      model: "models/gemini-2.5-flash-native-audio-latest",
    });
  });

  it("full setup uses AUDIO-only modalities for native-audio with audio_text", () => {
    const msg = buildClientLiveSetupMessage({
      model: "gemini-2.5-flash-native-audio-latest",
      systemInstruction: "voice assistant",
      settings: {
        ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
        responseMode: "audio_text",
      },
      embeddedSetup: false,
    });
    const generationConfig = msg.setup.generationConfig as { responseModalities?: string[] };
    expect(generationConfig.responseModalities).toEqual(["AUDIO"]);
  });

  it("full setup includes realtimeInputConfig and tools", () => {
    const msg = buildClientLiveSetupMessage({
      model: "gemini-2.5-flash-native-audio-latest",
      systemInstruction: "voice assistant",
      settings: DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
      embeddedSetup: false,
    });
    expect(msg.setup.model).toBe("models/gemini-2.5-flash-native-audio-latest");
    expect(msg.setup.generationConfig).toBeDefined();
    expect(msg.setup.realtimeInputConfig).toEqual(
      buildRealtimeInputConfig(DEFAULT_GEMINI_LIVE_VOICE_SETTINGS),
    );
    const tools = msg.setup.tools as Array<{ functionDeclarations?: unknown[] }>;
    expect(tools[0]?.functionDeclarations?.length).toBeGreaterThan(0);
  });
});

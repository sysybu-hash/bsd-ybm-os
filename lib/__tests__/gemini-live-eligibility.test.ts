import {
  isGeminiLiveContextReady,
} from "@/lib/gemini-live/eligibility";

describe("isGeminiLiveContextReady", () => {
  const fallbackVoice =
    "You are the BSD-YBM OS voice assistant (Gemini Live). Reply in Hebrew only. Use tools for all in-app actions: execute_user_command, run_automation, execute_os_command, search_site. Answer any topic when asked.";

  it("accepts client fallback voice instruction after assistant refresh", () => {
    expect(
      isGeminiLiveContextReady({
        assistantReady: true,
        assistantLoading: false,
        systemInstructionVoice: fallbackVoice,
        context: null,
      }),
    ).toBe(true);
  });

  it("waits while assistant context is loading", () => {
    expect(
      isGeminiLiveContextReady({
        assistantReady: false,
        assistantLoading: true,
        systemInstructionVoice: fallbackVoice,
        context: null,
      }),
    ).toBe(false);
  });
});

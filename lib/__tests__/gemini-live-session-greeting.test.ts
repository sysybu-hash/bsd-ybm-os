import {
  GEMINI_LIVE_SESSION_START_TAG,
  buildGeminiLiveSessionStartUserTurn,
} from "@/lib/gemini-live/session-greeting";

describe("gemini-live session greeting", () => {
  it("includes session start tag", () => {
    expect(buildGeminiLiveSessionStartUserTurn("he")).toContain(GEMINI_LIVE_SESSION_START_TAG);
  });

  it("includes user name when provided", () => {
    expect(buildGeminiLiveSessionStartUserTurn("he", "יוסי")).toContain("יוסי");
  });
});

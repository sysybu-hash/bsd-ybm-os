import { GEMINI_LIVE_TURN_COVERAGE, GEMINI_SCHEMA_TYPE } from "@/lib/gemini-live/api-constants";

describe("gemini-live api constants", () => {
  it("exposes stable string literals for browser-safe Live config", () => {
    expect(GEMINI_LIVE_TURN_COVERAGE.TURN_INCLUDES_ONLY_ACTIVITY).toBe(
      "TURN_INCLUDES_ONLY_ACTIVITY",
    );
    expect(GEMINI_SCHEMA_TYPE.OBJECT).toBe("OBJECT");
    expect(GEMINI_SCHEMA_TYPE.STRING).toBe("STRING");
  });
});

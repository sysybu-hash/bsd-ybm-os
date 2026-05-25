import {
  clearGeminiLiveRateLimitCooldown,
  getGeminiLiveRateLimitCooldownUntilMs,
  isGeminiLiveRateLimited,
  setGeminiLiveRateLimitCooldown,
} from "@/lib/gemini-live/rate-limit-cooldown";

describe("gemini-live rate-limit cooldown", () => {
  beforeEach(() => {
    clearGeminiLiveRateLimitCooldown();
  });

  it("stores and reads cooldown until timestamp", () => {
    const until = new Date(Date.now() + 60_000);
    setGeminiLiveRateLimitCooldown(until);
    expect(isGeminiLiveRateLimited()).toBe(true);
    expect(getGeminiLiveRateLimitCooldownUntilMs()).toBe(until.getTime());
  });

  it("clears expired cooldown", () => {
    const until = new Date(Date.now() - 1_000);
    setGeminiLiveRateLimitCooldown(until);
    expect(getGeminiLiveRateLimitCooldownUntilMs()).toBeNull();
    expect(isGeminiLiveRateLimited()).toBe(false);
  });
});

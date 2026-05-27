import {
  getApiCooldownRemainingMs,
  isApiCooldown,
  markApiCooldownFromResponse,
  markApiCooldownMs,
} from "@/lib/client/api-rate-limit-backoff";

describe("api-rate-limit-backoff", () => {
  it("tracks cooldown window", () => {
    markApiCooldownMs("test:key", 5_000);
    expect(isApiCooldown("test:key")).toBe(true);
    expect(getApiCooldownRemainingMs("test:key")).toBeGreaterThan(0);
  });

  it("detects 429 status on response-like object", () => {
    const marked = markApiCooldownFromResponse("test:429", {
      status: 429,
      headers: { get: (name: string) => (name === "Retry-After" ? "30" : null) },
    } as Response);
    expect(marked).toBe(true);
    expect(isApiCooldown("test:429")).toBe(true);
  });
});

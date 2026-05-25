import {
  formatGeminiLiveRateLimitMessage,
  formatGeminiLiveUserMessage,
  getGeminiLiveUserErrorKey,
  parseGeminiLiveRetryAt,
} from "@/lib/gemini-live-user-message";

describe("gemini-live-user-message", () => {
  it("detects new_session_expire_time deadline exceeded", () => {
    const raw = "new_session_expire_time deadline exceeded";
    expect(getGeminiLiveUserErrorKey(raw)).toBe("sessionExpired");
    expect(formatGeminiLiveUserMessage(raw)).toContain("פג תוקף");
  });

  it("uses i18n key when translate is provided", () => {
    const raw = "new_session_expire_time deadline exceeded";
    const translated = formatGeminiLiveUserMessage(raw, (key) =>
      key === "workspaceWidgets.aiChat.liveSessionExpired" ? "SESSION_EXPIRED_I18N" : key,
    );
    expect(translated).toBe("SESSION_EXPIRED_I18N");
  });

  it("maps Google internal error to Hebrew-friendly message", () => {
    expect(getGeminiLiveUserErrorKey("Internal error encountered.")).toBe("internal");
    expect(formatGeminiLiveUserMessage("Internal error encountered.")).toContain("Google Gemini Live");
  });

  it("maps websocket connection failures", () => {
    expect(getGeminiLiveUserErrorKey("Gemini Live WebSocket failed")).toBe("connection");
  });

  it("detects rate limit and formats Hebrew datetime instead of raw ISO", () => {
    const iso = "2026-05-24T17:01:52.337Z";
    const raw = `הגבלת קצב. נסו שוב אחרי ${iso}.`;
    expect(getGeminiLiveUserErrorKey(raw)).toBe("rateLimited");
    const formatted = formatGeminiLiveUserMessage(raw, undefined, { locale: "he" });
    expect(formatted).not.toContain("2026-05-24T17:01:52.337Z");
    expect(formatted).toMatch(/הגבלת קצב/);
  });

  it("parses resetAt and retryAfter from API JSON", () => {
    const resetAt = "2026-05-24T18:00:00.000Z";
    const parsed = parseGeminiLiveRetryAt("", { resetAt, retryAfterSec: 120 });
    expect(parsed?.toISOString()).toBe(new Date(resetAt).toISOString());
  });

  it("parses Google retryDelay from error JSON", () => {
    const raw = JSON.stringify({
      error: {
        message: "Resource exhausted",
        details: [{ retryDelay: "45s" }],
      },
    });
    const parsed = parseGeminiLiveRetryAt(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.getTime()).toBeGreaterThan(Date.now() + 40_000);
  });

  it("formats rate limit with i18n template", () => {
    const retryAt = new Date("2026-05-24T17:01:52.337Z");
    const msg = formatGeminiLiveRateLimitMessage(retryAt, "he", (key) =>
      key === "workspaceWidgets.aiChat.liveRateLimited"
        ? "נסו שוב ב-{retryAt}"
        : key,
    );
    expect(msg).not.toContain("2026-05-24T17:01:52.337Z");
    expect(msg).toMatch(/נסו שוב ב-/);
  });
});

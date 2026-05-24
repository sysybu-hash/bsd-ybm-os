import {
  formatGeminiLiveUserMessage,
  getGeminiLiveUserErrorKey,
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
});

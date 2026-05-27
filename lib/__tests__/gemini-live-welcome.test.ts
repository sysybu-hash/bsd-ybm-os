import {
  buildLiveWelcomeSpeech,
  resolveLiveWelcomeTimeOfDay,
} from "@/lib/gemini-live/welcome-script";
import {
  acquireGeminiLiveLease,
  getGeminiLiveOwner,
  releaseGeminiLiveLease,
} from "@/lib/gemini-live/session-coordinator";

const morning = new Date("2026-05-27T07:00:00+03:00");

describe("buildLiveWelcomeSpeech", () => {
  it("uses short neutral Hebrew without name (morning)", () => {
    expect(buildLiveWelcomeSpeech("he", undefined, morning)).toBe(
      "בוקר טוב. אני העוזר של BSD-YBM OS. במה לעזור בסביבת העבודה?",
    );
  });

  it("includes first name only in Hebrew", () => {
    expect(buildLiveWelcomeSpeech("he", "יוחנן בוקשפן", morning)).toBe(
      "בוקר טוב יוחנן. אני העוזר של BSD-YBM OS. במה לעזור בסביבת העבודה?",
    );
  });

  it("uses afternoon phrase in English", () => {
    const afternoon = new Date("2026-05-27T14:00:00+03:00");
    expect(resolveLiveWelcomeTimeOfDay(afternoon)).toBe("afternoon");
    expect(buildLiveWelcomeSpeech("en", "Alex", afternoon)).toBe(
      "Good afternoon, Alex. I'm your BSD-YBM OS assistant. How can I help in your workspace?",
    );
  });
});

describe("gemini-live session coordinator", () => {
  it("allows only one owner at a time", () => {
    const stops: string[] = [];
    const id1 = acquireGeminiLiveLease("omnibar", () => stops.push("omnibar"));
    expect(getGeminiLiveOwner()).toBe("omnibar");

    const id2 = acquireGeminiLiveLease("aiChatFull", () => stops.push("chat"));
    expect(stops).toEqual(["omnibar"]);
    expect(getGeminiLiveOwner()).toBe("aiChatFull");

    releaseGeminiLiveLease(id2);
    expect(getGeminiLiveOwner()).toBeNull();

    releaseGeminiLiveLease(id1);
  });
});

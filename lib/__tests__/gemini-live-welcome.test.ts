import { buildLiveWelcomeSpeech } from "@/lib/gemini-live/welcome-script";
import {
  acquireGeminiLiveLease,
  getGeminiLiveOwner,
  releaseGeminiLiveLease,
} from "@/lib/gemini-live/session-coordinator";

describe("buildLiveWelcomeSpeech", () => {
  it("uses short neutral Hebrew without name", () => {
    expect(buildLiveWelcomeSpeech("he")).toBe(
      "שלום. אני העוזר מבית BSD-YBM. מה תרצו לבצע?",
    );
  });

  it("includes first name only in Hebrew", () => {
    expect(buildLiveWelcomeSpeech("he", "יוחנן בוקשפן")).toBe(
      "שלום יוחנן. אני העוזר מבית BSD-YBM. מה תרצו לבצע?",
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

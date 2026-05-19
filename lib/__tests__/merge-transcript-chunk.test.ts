import { mergeTranscriptChunk } from "@/lib/gemini-live/merge-transcript-chunk";

describe("mergeTranscriptChunk", () => {
  it("returns chunk when previous is empty", () => {
    expect(mergeTranscriptChunk("", "שלום")).toBe("שלום");
  });

  it("uses cumulative longer chunk", () => {
    expect(mergeTranscriptChunk("שלום", "שלום עולם")).toBe("שלום עולם");
  });

  it("appends delta words", () => {
    expect(mergeTranscriptChunk("מה", "אתה")).toBe("מה אתה");
    expect(mergeTranscriptChunk("מה אתה", "רוצה")).toBe("מה אתה רוצה");
  });

  it("keeps longer previous when chunk is shorter prefix", () => {
    expect(mergeTranscriptChunk("שלום עולם", "שלום")).toBe("שלום עולם");
  });
});

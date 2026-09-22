/**
 * A moved room blocks the still, so a wrong verdict is expensive: it throws
 * away a frame that was right. Two looks must agree before we believe one.
 */
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";

const generateContent = jest.fn();

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: (...args: unknown[]) => generateContent(...args) };
    }
  },
}));
jest.mock("@/lib/gemini-api-key", () => ({ getGeminiApiKey: () => "key" }));
jest.mock("@/lib/gemini-model", () => ({
  ...jest.requireActual("@/lib/gemini-model"),
  getFloorplanLayoutModelChain: () => ["gemini-test"],
}));
jest.mock("@/lib/ai-usage", () => ({ recordAiUsage: () => undefined, usageFromGemini: () => null }));

const layout = () =>
  parseFloorplanLayout({
    rooms: [
      { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 } },
      { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.5, y: 0.1, w: 0.3, h: 0.3 } },
      { name: "אמבטיה", kind: "bathroom", bbox: { x: 0.1, y: 0.6, w: 0.3, h: 0.3 } },
    ],
  });

const answer = (rows: Array<[string, string]>) => ({
  response: {
    text: () =>
      JSON.stringify({
        // "has: false" is what makes a verdict; the found value says what is
        // there instead. A region answered "bedroom" is where it should be.
        regions: rows.map(([id, found]) => ({ id, found, has: found === "bedroom" || found === "bathroom" })),
      }),
  },
});

const still = { base64: "still", mimeType: "image/jpeg" };

beforeEach(() => jest.clearAllMocks());

describe("the placement audit's second look", () => {
  it("keeps only what both looks call moved", async () => {
    const { checkRoomPlacement } = await import("@/lib/projects/floorplan-viz-placement");
    generateContent
      .mockResolvedValueOnce(answer([["r1", "kitchen"], ["r2", "living"], ["r3", "bathroom"]]))
      // Asked again about r1 and r2 alone, the auditor stands by r1 only.
      .mockResolvedValueOnce(answer([["r1", "kitchen"], ["r2", "bedroom"]]));
    const moved = await checkRoomPlacement(still, layout());
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(moved).toHaveLength(1);
    expect(moved![0]).toMatch(/should be a bedroom, the still shows kitchen/);
  });

  it("asks once when the first look finds nothing", async () => {
    const { checkRoomPlacement } = await import("@/lib/projects/floorplan-viz-placement");
    generateContent.mockResolvedValueOnce(
      answer([["r1", "bedroom"], ["r2", "bedroom"], ["r3", "bathroom"]]),
    );
    expect(await checkRoomPlacement(still, layout())).toEqual([]);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("keeps the first verdict when the second look never answers", async () => {
    const { checkRoomPlacement } = await import("@/lib/projects/floorplan-viz-placement");
    generateContent
      .mockResolvedValueOnce(answer([["r1", "kitchen"], ["r2", "bedroom"], ["r3", "bathroom"]]))
      .mockRejectedValueOnce(new Error("no answer"));
    const moved = await checkRoomPlacement(still, layout());
    expect(moved).toHaveLength(1);
  });
});

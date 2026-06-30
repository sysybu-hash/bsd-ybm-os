/**
 * Regression test for P0.1 — the Mistral OCR pre-pass text must be injected into
 * the instruction of *every* chunk when a large blueprint PDF is split. Before the
 * fix, analyzeChunkedPdf received only the raw userInstruction, silently dropping
 * the OCR preamble for exactly the multi-page case where OCR helps most.
 */

// Heavy AI provider modules are imported transitively by blueprint-analyze; stub
// them so the test stays hermetic and never touches env/SDK init. The spy runner
// passed to analyzeChunkedPdf means none of these are actually invoked.
jest.mock("@/lib/ai-providers", () => ({
  isOpenAiConfigured: () => false,
  isAnthropicConfigured: () => false,
  isGeminiConfigured: () => false,
  isMistralConfigured: () => false,
}));
jest.mock("@/lib/ai-chat", () => ({ runAiChat: jest.fn() }));
jest.mock("@/lib/gemini-model", () => ({ getBlueprintAnalysisModelChain: () => ["x"] }));
jest.mock("@/lib/tri-engine-extract", () => ({ geminiMultimodal: jest.fn() }));
jest.mock("@/lib/ai-extract-openai", () => ({ extractDocumentWithOpenAI: jest.fn() }));
jest.mock("@/lib/ai-extract-anthropic", () => ({ extractDocumentWithAnthropic: jest.fn() }));
jest.mock("@/lib/ai-extract-mistral", () => ({
  extractDocumentWithMistral: jest.fn(),
  extractTextWithMistralOCR: jest.fn(),
}));

import { analyzeChunkedPdf } from "@/lib/projects/blueprint-analyze";
import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";

const emptyAnalysis: BlueprintAnalysis = {
  tasks: [],
  milestones: [],
  boqLineItems: [],
  requiresReview: true,
};

const chunks = [
  { base64: "a", mimeType: "application/pdf", pageLabel: "עמודים 1-4" },
  { base64: "b", mimeType: "application/pdf", pageLabel: "עמודים 5-8" },
  { base64: "c", mimeType: "application/pdf", pageLabel: "עמודים 9-12" },
];

const OCR_PREAMBLE = "\n\n### טקסט שחולץ על-ידי Mistral OCR 4:\nכמויות בטון 30 מ\"ק\n";

describe("analyzeChunkedPdf — OCR preamble propagation", () => {
  it("injects the OCR preamble into every chunk instruction", async () => {
    const seen: string[] = [];
    const runner = async (_b: string, _m: string, instruction: string) => {
      seen.push(instruction);
      return emptyAnalysis;
    };

    await analyzeChunkedPdf(chunks, runner, "הוראת משתמש", OCR_PREAMBLE);

    expect(seen).toHaveLength(chunks.length);
    for (const instruction of seen) {
      expect(instruction).toContain(OCR_PREAMBLE.trim());
    }
  });

  it("omits the preamble when none is supplied (default empty)", async () => {
    const seen: string[] = [];
    const runner = async (_b: string, _m: string, instruction: string) => {
      seen.push(instruction);
      return emptyAnalysis;
    };

    await analyzeChunkedPdf(chunks, runner, "הוראת משתמש");

    expect(seen).toHaveLength(chunks.length);
    for (const instruction of seen) {
      expect(instruction).not.toContain("Mistral OCR 4");
    }
  });
});

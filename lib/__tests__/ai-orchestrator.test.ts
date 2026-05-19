const generateContent = jest.fn().mockResolvedValue({
  response: { text: () => "gemini-reply" },
});

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({ generateContent }),
  })),
}));

jest.mock("openai", () =>
  jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "openai-reply" } }],
        }),
      },
    },
  })),
);

jest.mock("@anthropic-ai/sdk", () =>
  jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: "claude-reply" }],
      }),
    },
  })),
);

jest.mock("groq-sdk", () => ({
  Groq: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "groq-reply" } }],
        }),
      },
    },
  })),
}));

import { askAI } from "@/lib/ai-orchestrator";

describe("askAI", () => {
  beforeEach(() => {
    generateContent.mockClear();
  });

  it("routes to gemini", async () => {
    const text = await askAI("gemini", "hello");
    expect(text).toBe("gemini-reply");
    expect(generateContent).toHaveBeenCalled();
  });

  it("routes to openai", async () => {
    const text = await askAI("openai", "hello");
    expect(text).toBe("openai-reply");
  });

  it("routes to claude", async () => {
    const text = await askAI("claude", "hello");
    expect(text).toBe("claude-reply");
  });

  it("routes to groq", async () => {
    const text = await askAI("groq", "hello");
    expect(text).toBe("groq-reply");
  });

  it("throws for unknown provider", async () => {
    await expect(askAI("unknown" as "gemini", "x")).rejects.toThrow(/Unsupported provider/);
  });
});

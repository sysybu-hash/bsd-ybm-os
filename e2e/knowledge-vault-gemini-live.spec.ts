import { test, expect } from "@playwright/test";

test.describe("Knowledge vault & Gemini Live API", () => {
  test("knowledge-vault items requires auth", async ({ request }) => {
    const res = await request.get("/api/knowledge-vault/items");
    expect([401, 403]).toContain(res.status());
  });

  test("gemini-live session requires auth", async ({ request }) => {
    const res = await request.post("/api/ai/gemini-live/session", {
      data: { responseMode: "audio_text", temperature: 0.7 },
    });
    expect([401, 403]).toContain(res.status());
  });
});

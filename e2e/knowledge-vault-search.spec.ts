import { test, expect } from "@playwright/test";

test.describe("knowledge vault search API", () => {
  test("requires auth", async ({ request }) => {
    const res = await request.get("/api/knowledge-vault/search?q=test");
    expect([401, 403]).toContain(res.status());
  });
});

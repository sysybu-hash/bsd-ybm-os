import { test, expect } from "@playwright/test";
import { tryCredentialsSignIn } from "./helpers";

test.describe("knowledge vault search API", () => {
  test("requires auth", async ({ request }) => {
    const res = await request.get("/api/knowledge-vault/search?q=test");
    expect([401, 403]).toContain(res.status());
  });

  test("authenticated search returns ok shape", async ({ page }) => {
    const signedIn = await tryCredentialsSignIn(page);
    test.skip(!signedIn, "E2E credentials not available");

    const res = await page.request.get("/api/knowledge-vault/search?q=invoice&limit=5");
    expect(res.status()).toBe(200);
    const json = (await res.json()) as { ok?: boolean; hits?: unknown[] };
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.hits)).toBe(true);
  });
});

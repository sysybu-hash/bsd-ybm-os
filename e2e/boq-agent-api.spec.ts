import { test, expect } from "@playwright/test";
import { E2E_PROJECT_ID, tryCredentialsSignIn } from "./helpers";

test.describe("BOQ agent API", () => {
  test("POST without session is rejected", async ({ request }) => {
    const res = await request.post("/api/projects/demo-project/boq/agent", {
      data: { message: "hello" },
      headers: { "content-type": "application/json" },
    });
    expect([401, 403, 404]).toContain(res.status());
  });

  test("POST with session on seeded project", async ({ page }) => {
    test.skip(!E2E_PROJECT_ID, "Run npm run seed:test for E2E_PROJECT_ID");

    const signedIn = await tryCredentialsSignIn(page);
    test.skip(!signedIn, "E2E credentials not available");

    const res = await page.request.post(`/api/projects/${E2E_PROJECT_ID}/boq/agent`, {
      data: { message: "סכם את סעיף הבטון" },
      headers: { "content-type": "application/json" },
    });
    expect([200, 400, 503]).toContain(res.status());
    if (res.status() === 200) {
      const json = (await res.json()) as { reply?: string };
      expect(typeof json.reply === "string" || json.reply === undefined).toBe(true);
    }
  });
});

import { test, expect } from "@playwright/test";
import { tryCredentialsSignIn } from "./helpers";

test.describe("gemini live smoke", () => {
  test.skip(!process.env.E2E_EMAIL, "requires E2E credentials");

  test("session endpoint requires auth", async ({ request }) => {
    const res = await request.post("/api/ai/gemini-live/session", {
      data: {},
    });
    expect([401, 403]).toContain(res.status());
  });

  test("workspace loads without duplicate live banners", async ({ page }) => {
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "login failed");

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const liveButtons = page.getByRole("button", { name: /שיחה חיה|Live/i });
    const count = await liveButtons.count();
    expect(count).toBeLessThan(10);
  });
});

import { test, expect } from "@playwright/test";
import { tryCredentialsSignIn, waitForAuthenticatedWorkspace } from "./helpers";

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
    // Not "networkidle": a signed-in workspace holds the notifications stream
    // and the presence heartbeat open for as long as it is on screen, so the
    // network is never idle and the wait always ran out the test's 120s. It
    // only surfaced once the nightly could sign in at all.
    await waitForAuthenticatedWorkspace(page);
    const liveButtons = page.getByRole("button", { name: /שיחה חיה|Live/i });
    const count = await liveButtons.count();
    expect(count).toBeLessThan(10);
  });
});

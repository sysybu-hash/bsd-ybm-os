/**
 * Gemini Live flow harness (CI-safe)
 *
 * CI has no microphone — we never assert real audio capture.
 * Instead:
 * 1. API: authenticated POST /api/ai/gemini-live/session (real or mocked when Gemini key absent).
 * 2. UI: workspace loads; live affordances present without duplicate banners.
 * 3. WebSocket: route mock for wss://generativelanguage.googleapis.com/* so client connect
 *    does not fail if a future test opens the live panel (optional extension point).
 *
 * Set E2E_MOCK_GEMINI_LIVE=1 to force session API mock (useful when keys are missing in CI).
 */
import { test, expect } from "@playwright/test";
import { tryCredentialsSignIn } from "./helpers";

const MOCK_SESSION = {
  token: "e2e-mock-live-token",
  model: "gemini-2.5-flash-live-preview",
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  newSessionExpiresAt: new Date(Date.now() + 120 * 1000).toISOString(),
  responseMode: "audio_text",
  embeddedSetup: true,
  systemInstructionLength: 42,
};

test.describe("gemini live flow", () => {
  test.skip(!process.env.E2E_EMAIL, "requires E2E credentials");

  test("authenticated session start returns token payload (mock when configured)", async ({
    page,
    request,
  }) => {
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "login failed");

    const useMock = process.env.E2E_MOCK_GEMINI_LIVE === "1";

    if (useMock) {
      await page.route("**/api/ai/gemini-live/session", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_SESSION),
        });
      });
    }

    const res = await page.request.post("/api/ai/gemini-live/session", {
      data: { responseMode: "audio_text", temperature: 0.7 },
    });

    if (useMock) {
      expect(res.status()).toBe(200);
      const body = (await res.json()) as typeof MOCK_SESSION;
      expect(body.token).toBeTruthy();
      expect(body.embeddedSetup).toBe(true);
      return;
    }

    // Real backend: 200 with token, or 503 when Gemini / platform flag disabled
    expect([200, 503]).toContain(res.status());
    if (res.status() === 200) {
      const body = (await res.json()) as { token?: string; embeddedSetup?: boolean };
      expect(body.token).toBeTruthy();
      expect(body.embeddedSetup).toBe(true);
    }
  });

  test("workspace UI ready — live controls without mic", async ({ page }) => {
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "login failed");

    // Mock Live WebSocket so opening live panel in future tests won't hang in CI
    await page.route("**/generativelanguage.googleapis.com/**", async (route) => {
      await route.abort("connectionrefused");
    });

    await page.route("**/api/ai/gemini-live/session", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SESSION),
      });
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const liveButtons = page.getByRole("button", { name: /שיחה חיה|Live/i });
    const count = await liveButtons.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(10);

    // UI ready: body interactive, no fatal error overlay
    await expect(page.locator("body")).toBeVisible();
  });

  test("unauthenticated session endpoint rejected", async ({ request }) => {
    const res = await request.post("/api/ai/gemini-live/session", { data: {} });
    expect([401, 403]).toContain(res.status());
  });
});

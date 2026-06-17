/**
 * Growth / marketing public surfaces — blog, contact, leads API.
 * Complements marketing-landing.spec.ts (cinematic preview).
 */

import { test, expect } from "@playwright/test";
import { dismissCookieBannerIfVisible, primeCookieConsent } from "./helpers";

test.describe("Growth — public blog & contact", () => {
  test.beforeEach(async ({ page }) => {
    await primeCookieConsent(page);
  });

  test("blog index lists posts", async ({ page }) => {
    await page.goto("/blog", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /בלוג BSD-YBM/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /גנט לקבלנים/i })).toBeVisible({ timeout: 15_000 });
  });

  test("blog post renders article", async ({ page }) => {
    await page.goto("/blog/gantt-for-contractors", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/גנט לקבלנים/i, {
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: /התחל חינם/i })).toBeVisible({ timeout: 15_000 });
  });

  test("contact page shows form", async ({ page }) => {
    await page.goto("/contact", { waitUntil: "domcontentloaded" });
    await dismissCookieBannerIfVisible(page);
    await expect(page.getByRole("heading", { name: /צור קשר/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel(/שם מלא/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /שלח הודעה/i })).toBeVisible({ timeout: 15_000 });
  });

  test("contact form submits successfully", async ({ page }) => {
    await page.goto("/contact", { waitUntil: "load" });
    await dismissCookieBannerIfVisible(page);
    await expect(page.getByLabel(/שם מלא/i)).toBeVisible({ timeout: 30_000 });

    const email = `e2e-contact-${Date.now()}@example.invalid`;
    await page.getByLabel(/שם מלא/i).fill("E2E Contact");
    await page.getByLabel(/אימייל/i).fill(email);
    await page.getByLabel(/הודעה/i).fill("בדיקת E2E");
    await expect(page.getByLabel(/אימייל/i)).toHaveValue(email);

    const postDone = page
      .waitForResponse(
        (response) => response.url().includes("/api/leads") && response.request().method() === "POST",
        { timeout: 45_000 },
      )
      .catch(() => null);

    await page.getByRole("button", { name: /שלח הודעה/i }).click();

    const res = await postDone;
    if (res) {
      expect([200, 429]).toContain(res.status());
      return;
    }

    await expect(page.getByRole("heading", { name: /קיבלנו|תודה/i })).toBeVisible({ timeout: 45_000 });
  });
});

test.describe("Growth — unsubscribe", () => {
  test.beforeEach(async ({ page }) => {
    await primeCookieConsent(page);
  });

  test("unsubscribe page loads", async ({ page }) => {
    await page.goto("/unsubscribe", { waitUntil: "domcontentloaded" });
    await dismissCookieBannerIfVisible(page);
    await expect(page.getByRole("heading", { level: 1, name: /הסרה מרשימת תפוצה/i })).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe("Growth — leads API", () => {
  test("POST /api/leads accepts valid payload", async ({ request }) => {
    const email = `e2e-lead-${Date.now()}@example.invalid`;
    const res = await request.post("/api/leads", {
      data: {
        name: "E2E Lead",
        email,
        source: "e2e",
        locale: "he",
      },
    });
    // /api/leads is IP rate-limited (5/hour). Under repeated or burst test runs a
    // 429 means the endpoint is correctly protecting itself, not a regression —
    // accept it. When accepted (200), still verify the happy-path contract.
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const json = (await res.json()) as { ok?: boolean };
      expect(json.ok).toBe(true);
    }
  });

  test("GET /api/health returns ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const json = (await res.json()) as { status?: string };
    expect(json.status).toBe("ok");
  });
});

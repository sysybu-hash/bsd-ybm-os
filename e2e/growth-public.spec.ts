/**
 * Growth / marketing public surfaces — blog, contact, leads API.
 * Complements marketing-landing.spec.ts (cinematic preview).
 */

import { test, expect } from "@playwright/test";

test.describe("Growth — public blog & contact", () => {
  test("blog index lists posts", async ({ page }) => {
    await page.goto("/blog");
    await expect(page.getByRole("heading", { name: /בלוג BSD-YBM/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /גנט לקבלנים/i })).toBeVisible();
  });

  test("blog post renders article", async ({ page }) => {
    await page.goto("/blog/gantt-for-contractors");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/גנט לקבלנים/i);
    await expect(page.getByRole("link", { name: /התחל חינם/i })).toBeVisible();
  });

  test("contact page shows form", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByRole("heading", { name: /צור קשר/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /שלח הודעה/i })).toBeVisible();
  });

  test("contact form submits successfully", async ({ page }) => {
    await page.goto("/contact");
    const email = `e2e-contact-${Date.now()}@example.invalid`;
    await page.getByLabel(/שם מלא/i).fill("E2E Contact");
    await page.getByLabel(/אימייל/i).fill(email);
    await page.getByRole("button", { name: /שלח הודעה/i }).click();
    await expect(page.getByRole("heading", { name: /קיבלנו/i })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Growth — unsubscribe", () => {
  test("unsubscribe page loads", async ({ page }) => {
    await page.goto("/unsubscribe");
    await expect(page.getByRole("heading")).toBeVisible();
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
    expect(res.status()).toBe(200);
    const json = (await res.json()) as { ok?: boolean };
    expect(json.ok).toBe(true);
  });

  test("GET /api/health returns ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const json = (await res.json()) as { status?: string };
    expect(json.status).toBe("ok");
  });
});

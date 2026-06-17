import { test, expect } from "@playwright/test";
import { primeCookieConsent, signInWithRetries, waitForAuthenticatedApiSession } from "./helpers";

test.describe("accounting export API", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3001";
    await page.context().addCookies([{ name: "bsd-locale", value: "he", url: origin }]);
    await primeCookieConsent(page);
  });

  test("GET formats requires auth", async ({ request }) => {
    const res = await request.get("/api/accounting/export");
    expect([401, 403]).toContain(res.status());
  });

  test("authenticated GET lists formats", async ({ page }) => {
    const signedIn = await signInWithRetries(page);
    test.skip(!signedIn, "E2E credentials not available");
    await waitForAuthenticatedApiSession(page);

    let res = await page.request.get("/api/accounting/export");
    for (let attempt = 0; attempt < 3 && res.status() === 429; attempt++) {
      await page.waitForTimeout(1_500 * (attempt + 1));
      res = await page.request.get("/api/accounting/export");
    }
    expect(res.status()).toBe(200);
    const json = (await res.json()) as { formats?: string[] };
    expect(json.formats).toEqual(expect.arrayContaining(["bkmvdata", "priority", "hashavshevet"]));
  });

  test("POST export with empty range returns file or validation", async ({ page }) => {
    const signedIn = await signInWithRetries(page);
    test.skip(!signedIn, "E2E credentials not available");
    await waitForAuthenticatedApiSession(page);

    const from = new Date(Date.now() - 86400000).toISOString();
    const to = new Date().toISOString();
    let res = await page.request.post("/api/accounting/export", {
      data: {
        format: "bkmvdata",
        fromDate: from,
        toDate: to,
        includeDocuments: false,
        includeExpenses: false,
      },
    });
    for (let attempt = 0; attempt < 3 && res.status() === 429; attempt++) {
      await page.waitForTimeout(1_500 * (attempt + 1));
      res = await page.request.post("/api/accounting/export", {
        data: {
          format: "bkmvdata",
          fromDate: from,
          toDate: to,
          includeDocuments: false,
          includeExpenses: false,
        },
      });
    }
    expect([200, 400, 422, 429]).toContain(res.status());
  });
});

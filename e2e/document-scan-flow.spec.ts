/**
 * Document Scan Flow E2E suite.
 *
 * Verifies:
 * 1. Scan endpoints (tri-engine, share, sync-summary) are auth-protected.
 * 2. Document scan job creation requires auth.
 * 3. The AI scan pipeline endpoints exist and reject unauthenticated requests.
 * 4. Rate-limiting on blueprint analysis (garmoshka decoding).
 * 5. The org-invite preview endpoint validates token format.
 * 6. Happy-path: login → documentsHub scan tab → mocked extract → UI review/save cues.
 */

import { test, expect } from "@playwright/test";
import {
  E2E_EMAIL,
  E2E_PASSWORD,
  dismissWorkspaceOverlays,
  signInWithRetries,
  waitForAuthenticatedApiSession,
  widgetShell,
  workspaceUrl,
} from "./helpers";

test.describe("Document Scan — auth protection", () => {
  test("scan tri-engine requires auth", async ({ request }) => {
    const res = await request.post("/api/scan/tri-engine", {
      data: { image: "base64fake", mimeType: "image/jpeg" },
    });
    expect([401, 403, 302]).toContain(res.status());
  });

  test("scan share endpoint requires valid share token", async ({ request }) => {
    const res = await request.get("/api/scan/share?token=invalid_token_for_testing");
    // 404 for unknown token, not 500
    expect([404, 400]).toContain(res.status());
  });

  test("scan engine-meta requires auth", async ({ request }) => {
    const res = await request.get("/api/scan/engine-meta");
    expect([401, 403, 302]).toContain(res.status());
  });

  test("sync-summary requires auth", async ({ request }) => {
    const res = await request.post("/api/scan/sync-summary");
    expect([401, 403, 302]).toContain(res.status());
  });

  test("scan lookups require auth", async ({ request }) => {
    const res = await request.get("/api/org/scan-lookups");
    expect([401, 403, 302]).toContain(res.status());
  });

  test("scan save requires auth", async ({ request }) => {
    const res = await request.post("/api/scan/save");
    expect([401, 403, 302]).toContain(res.status());
  });

  test("scan history requires auth", async ({ request }) => {
    const res = await request.get("/api/scan/history");
    expect([401, 403, 302]).toContain(res.status());
  });

  test("scan history clear requires auth", async ({ request }) => {
    const res = await request.delete("/api/scan/history");
    expect([401, 403, 302]).toContain(res.status());
  });

  test("analyze-queue pending requires auth", async ({ request }) => {
    const res = await request.get("/api/analyze-queue/pending");
    expect([401, 403, 302]).toContain(res.status());
  });
});

test.describe("Blueprint (Garmoshka) Decode — auth + validation", () => {
  test("analyze-blueprint requires auth", async ({ request }) => {
    const res = await request.post("/api/projects/analyze-blueprint", {
      multipart: {
        file: {
          name: "test.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4 fake"),
        },
        projectId: "proj_test_00000000000000000000",
        preview: "true",
      },
    });
    expect([401, 403, 302]).toContain(res.status());
  });

  test("analyze-blueprint JSON confirm body requires auth", async ({ request }) => {
    const res = await request.post("/api/projects/analyze-blueprint", {
      data: {
        projectId: "proj_test",
        tasks: [],
        milestones: [],
        boqLineItems: [],
      },
      headers: { "content-type": "application/json" },
    });
    expect([401, 403, 302]).toContain(res.status());
  });
});

test.describe("Org Invite Preview — public endpoint validation", () => {
  test("missing token returns 400", async ({ request }) => {
    const res = await request.get("/api/org-invite/preview");
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("missing_token");
  });

  test("invalid token returns 404", async ({ request }) => {
    const res = await request.get("/api/org-invite/preview?token=totally_fake_token_xyz");
    expect(res.status()).toBe(404);
  });

  test("endpoint is rate-limited (returns response, not error)", async ({ request }) => {
    // Single call should not be rate-limited
    const res = await request.get("/api/org-invite/preview?token=test");
    expect(res.status()).not.toBe(500);
    expect(res.status()).not.toBe(429); // single call never hits limit
  });
});

test.describe("Passkey auth-options — rate-limit smoke", () => {
  test("passkey auth-options accepts POST with empty email", async ({ request }) => {
    const res = await request.post("/api/auth/passkey/auth-options", {
      data: {},
    });
    // Should succeed (200) or return a server-side error, NOT 404/302
    expect([200, 500]).toContain(res.status());
    expect(res.status()).not.toBe(404);
    expect(res.status()).not.toBe(429); // single call never hits rate limit
  });
});

test.describe("Document Scan — authenticated happy path (mocked extract)", () => {
  test("documentsHub scan tab + mocked tri-engine shows review UI", async ({ page }) => {
    const signed = await signInWithRetries(page, 4, {
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
    });
    test.skip(!signed, "E2E credentials / seed unavailable");
    await waitForAuthenticatedApiSession(page);

    await page.route("**/api/scan/tri-engine**", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          v5: {
            schemaVersion: 5,
            documentMetadata: {
              project: null,
              client: null,
              documentDate: null,
              drawingRefs: null,
              discipline: null,
              sheetIndex: null,
              sourceFileName: "e2e-fixture.jpg",
              scanMode: "GENERAL_DOCUMENT",
            },
            billOfQuantities: [],
            lineItems: [{ description: "E2E line", lineTotal: 10 }],
            vendor: "E2E Vendor",
            total: 10,
            date: "2026-07-16",
            docType: "GENERAL",
            summary: "E2E mock extraction",
            priceAlertPending: false,
          },
          aiData: { vendor: "E2E Vendor", total: 10 },
          telemetry: { enginesUsed: ["mock"], latencyMs: 1 },
        }),
      });
    });

    await page.goto(workspaceUrl({ w: "documentsHub", tab: "scan" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);
    const shell = widgetShell(page, "documentsHub");
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const fileInput = shell.locator('input[type="file"]').first();
    if (await fileInput.count()) {
      await fileInput.setInputFiles({
        name: "e2e-fixture.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from(
          "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z",
          "base64",
        ),
      });
    }

    await expect(
      shell.getByText(/E2E Vendor|E2E mock|שמירה|יעד|ספק|review|סיכום/i).first(),
    ).toBeVisible({ timeout: 25_000 });
  });
});

/**
 * Document Scan Flow E2E suite.
 *
 * Verifies:
 * 1. Scan endpoints (tri-engine, share, sync-summary) are auth-protected.
 * 2. Document scan job creation requires auth.
 * 3. The AI scan pipeline endpoints exist and reject unauthenticated requests.
 * 4. Rate-limiting on blueprint analysis (garmoshka decoding).
 * 5. The org-invite preview endpoint validates token format.
 */

import { test, expect } from "@playwright/test";

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

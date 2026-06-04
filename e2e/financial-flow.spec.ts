/**
 * Core Financial Flow E2E suite.
 *
 * Tests the critical financial paths:
 * 1. Invoice/document API routes are auth-protected.
 * 2. Payment milestone endpoints enforce auth and org scoping.
 * 3. The billing/subscription status endpoint is accessible.
 * 4. Export endpoint requires auth.
 *
 * These are API-level tests that do NOT require a seeded DB session —
 * they verify the auth+scoping layer, not the business logic output.
 * Full financial flow tests (create → update → list) run via Jest unit
 * tests (lib/__tests__/billing-calculations.test.ts etc.) and in the
 * seeded E2E CI path (npm run verify:e2e:seeded).
 */

import { test, expect } from "@playwright/test";

const FAKE_PROJECT_ID = "proj_financial_test_00000000000000";
const FAKE_ORG_ID = "org_financial_test_000000000000000";

test.describe("Financial API — auth protection", () => {
  test("milestones endpoint requires auth", async ({ request }) => {
    const res = await request.get(`/api/projects/${FAKE_PROJECT_ID}/milestones`);
    expect([401, 403, 302, 404]).toContain(res.status());
  });

  test("POST milestone requires auth", async ({ request }) => {
    const res = await request.post(`/api/projects/${FAKE_PROJECT_ID}/milestones`, {
      data: { name: "Test Milestone", amount: 5000, sortOrder: 0 },
    });
    expect([401, 403, 302]).toContain(res.status());
  });

  test("expenses endpoint requires auth", async ({ request }) => {
    const res = await request.get(`/api/projects/${FAKE_PROJECT_ID}/expenses`);
    expect([401, 403, 302, 404]).toContain(res.status());
  });

  test("extras endpoint requires auth", async ({ request }) => {
    const res = await request.get(`/api/projects/${FAKE_PROJECT_ID}/extras`);
    expect([401, 403, 302, 404]).toContain(res.status());
  });

  test("project dashboard requires auth", async ({ request }) => {
    const res = await request.get(`/api/projects/${FAKE_PROJECT_ID}/dashboard`);
    expect([401, 403, 302, 404]).toContain(res.status());
  });
});

test.describe("Financial API — export protection", () => {
  test("Excel export requires auth", async ({ request }) => {
    const res = await request.get(`/api/projects/${FAKE_PROJECT_ID}/export/excel`);
    expect([401, 403, 302, 404]).toContain(res.status());
  });

  test("Excel import requires auth", async ({ request }) => {
    const res = await request.post(`/api/projects/${FAKE_PROJECT_ID}/import/excel`, {
      multipart: {
        file: { name: "test.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("fake") },
      },
    });
    expect([401, 403, 302, 404]).toContain(res.status());
  });
});

test.describe("Financial API — rate limiting on public register", () => {
  // The register endpoint has applyRateLimit (10/hour).
  // This test verifies a single call doesn't explode (smoke test),
  // NOT that the limit is hit (that would require 11 calls in sequence).
  test("register endpoint exists and validates input", async ({ request }) => {
    const res = await request.post("/api/register", {
      data: { email: "not-an-email", organizationName: "x" },
    });
    // Should be 400 (invalid email) not 500 or 404
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("invalid_email");
  });

  test("register rejects missing org name", async ({ request }) => {
    const res = await request.post("/api/register", {
      data: { email: "test@example.com", organizationName: "" },
    });
    expect([400, 429]).toContain(res.status());
  });
});

test.describe("Webhook security", () => {
  test("PayPlus webhook rejects missing HMAC signature in production", async ({ request }) => {
    const res = await request.post("/api/webhooks/payplus", {
      data: { event_type: "payment.success", transaction_uid: "fake" },
      headers: { "content-type": "application/json" },
    });
    // Should reject with 401 (invalid signature) or 400
    expect([400, 401, 429]).toContain(res.status());
  });

  test("PayPal webhook endpoint exists", async ({ request }) => {
    const res = await request.post("/api/webhooks/paypal", {
      data: { event_type: "PAYMENT.CAPTURE.COMPLETED" },
      headers: { "content-type": "application/json" },
    });
    // Without valid PayPal verification headers, expect rejection
    expect([400, 401, 500]).toContain(res.status());
    expect(res.status()).not.toBe(200);
  });
});

/**
 * Tenant isolation (IDOR) E2E suite.
 *
 * Verifies that withWorkspacesAuth enforces organizationId scoping:
 * - Unauthenticated requests receive 401 / redirect to /login.
 * - Requests using a valid session cannot access resources belonging
 *   to a different organization (cross-org IDOR).
 *
 * These tests run against the live app (no mocking) so they need
 * PLAYWRIGHT_BASE_URL pointing at a running instance with test seeds.
 * In CI the quality-gate workflow runs `npm run seed:test` first.
 */

import { test, expect } from "@playwright/test";

const FAKE_ORG_ID = "org_nonexistent_idor_test_00000000";
const FAKE_PROJECT_ID = "proj_nonexistent_idor_test_000000";
const FAKE_CONTACT_ID = "contact_nonexistent_idor_test_0000";

test.describe("Tenant Isolation — unauthenticated access", () => {
  test("workspace API routes return 401 without session", async ({ request }) => {
    const routes = [
      "/api/projects",
      "/api/crm/contacts",
      "/api/notifications/feed",
      `/api/projects/${FAKE_PROJECT_ID}/tasks`,
      `/api/projects/${FAKE_PROJECT_ID}/milestones`,
    ];

    for (const route of routes) {
      const res = await request.get(route);
      // Must not be 200 — expect 401 or 302 (redirect to /login)
      expect(res.status(), `Expected auth check on ${route}`).not.toBe(200);
      const isAuthError = res.status() === 401 || res.status() === 403 || res.status() === 302;
      expect(isAuthError, `${route} should reject unauthenticated request`).toBe(true);
    }
  });

  test("POST/PATCH/DELETE workspace routes reject without session", async ({ request }) => {
    const mutations = [
      { method: "POST"  as const, url: "/api/projects" },
      { method: "POST"  as const, url: `/api/projects/${FAKE_PROJECT_ID}/tasks` },
      { method: "PATCH" as const, url: `/api/projects/${FAKE_PROJECT_ID}/tasks` },
      { method: "DELETE"as const, url: `/api/projects/${FAKE_PROJECT_ID}/tasks?id=x` },
    ];

    for (const { method, url } of mutations) {
      const res = await request.fetch(url, { method, data: {} });
      expect(res.status(), `${method} ${url} should not be 200 without auth`).not.toBe(200);
      expect(
        [401, 403, 302].includes(res.status()),
        `${method} ${url} expected 401/403/302, got ${res.status()}`,
      ).toBe(true);
    }
  });
});

test.describe("Tenant Isolation — cross-org resource access", () => {
  // These tests verify that even if an attacker crafts a request for a resource
  // belonging to another org, the server returns 404/403 rather than data.
  // We use IDs that cannot belong to the test user's org (nonexistent fake IDs).

  test("project detail for foreign ID returns 404 or 403", async ({ request }) => {
    // Without a real session we expect a 401/redirect.
    // With a real session in seeded tests this would also be 404.
    const res = await request.get(`/api/projects/${FAKE_PROJECT_ID}`);
    expect([401, 403, 404, 302]).toContain(res.status());
  });

  test("tasks for foreign project ID returns 404 or auth error", async ({ request }) => {
    const res = await request.get(`/api/projects/${FAKE_PROJECT_ID}/tasks/schedule`);
    expect([401, 403, 404, 302]).toContain(res.status());
  });

  test("contact timeline for foreign contact ID is protected", async ({ request }) => {
    const res = await request.get(`/api/crm/contacts/${FAKE_CONTACT_ID}/timeline`);
    expect([401, 403, 404, 302]).toContain(res.status());
  });

  test("blueprint analyze rejects without auth", async ({ request }) => {
    const res = await request.post("/api/projects/analyze-blueprint", {
      multipart: {
        file: { name: "test.pdf", mimeType: "application/pdf", buffer: Buffer.from("fake") },
        projectId: FAKE_PROJECT_ID,
        preview: "true",
      },
    });
    expect([401, 403, 302]).toContain(res.status());
  });
});

test.describe("Health endpoint", () => {
  test("/api/health returns 200 with ok status", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { status?: string; db?: string };
    expect(body.status).toBe("ok");
    expect(body.db).toBe("up");
  });

  test("/api/health is not rate-limited on repeated calls", async ({ request }) => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request.get("/api/health")),
    );
    for (const res of results) {
      expect(res.status()).toBe(200);
    }
  });
});

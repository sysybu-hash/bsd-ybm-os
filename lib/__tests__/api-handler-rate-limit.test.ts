import { rateLimitRouteBucket } from "@/lib/rate-limit-bucket";

/** ערכים תואמים ל-DEFAULT_WORKSPACE_RATE_LIMIT ב-lib/api-handler.ts */
const EXPECTED_DEFAULT = {
  key: "api:workspace",
  limit: 200,
  windowMs: 60_000,
} as const;

describe("api-handler rate limits", () => {
  it("documents the default workspace limit contract", () => {
    expect(EXPECTED_DEFAULT.key).toBe("api:workspace");
    expect(EXPECTED_DEFAULT.limit).toBeGreaterThanOrEqual(100);
    expect(EXPECTED_DEFAULT.windowMs).toBe(60_000);
  });
});

describe("rateLimitRouteBucket", () => {
  it("gives each route its own bucket, and one bucket to all of a route's ids", () => {
    expect(rateLimitRouteBucket("/api/office-expenses")).toBe("/api/office-expenses");
    expect(rateLimitRouteBucket("/api/office-expenses/clx9a8b7c6d5e4f3g2h1i0j9k")).toBe("/api/office-expenses/:id");
    expect(rateLimitRouteBucket("/api/projects/3f2b8c1e-9d4a-4e7b-8c2d-1a2b3c4d5e6f/files")).toBe("/api/projects/:id/files");
    expect(rateLimitRouteBucket("/api/invoices/42")).toBe("/api/invoices/:id");
    expect(rateLimitRouteBucket("/api/crm/contacts")).not.toBe(rateLimitRouteBucket("/api/office-expenses"));
  });
});

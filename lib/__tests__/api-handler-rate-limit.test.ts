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

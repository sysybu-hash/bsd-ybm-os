describe("osAdminEmails / isAdmin", () => {
  const envBag = process.env as { NODE_ENV?: string };
  const ORIGINAL_ENV = envBag.NODE_ENV;

  afterEach(() => {
    envBag.NODE_ENV = ORIGINAL_ENV;
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("uses env allowlist when set", async () => {
    jest.doMock("@/lib/env", () => ({
      env: {
        OS_ADMIN_EMAILS: "ops@example.com, other@example.com",
        OS_ADMIN_EMAIL: undefined,
      },
    }));
    envBag.NODE_ENV = "production";
    jest.resetModules();
    jest.doMock("@/lib/env", () => ({
      env: {
        OS_ADMIN_EMAILS: "ops@example.com, other@example.com",
        OS_ADMIN_EMAIL: undefined,
      },
    }));
    const { osAdminEmails, isAdmin } = await import("@/lib/is-admin");
    expect(osAdminEmails()).toEqual(["ops@example.com", "other@example.com"]);
    expect(isAdmin("ops@example.com")).toBe(true);
    expect(isAdmin("yb@bsd-ybm.co.il")).toBe(false);
  });

  it("fail-closed in production when env is empty", async () => {
    envBag.NODE_ENV = "production";
    jest.resetModules();
    jest.doMock("@/lib/env", () => ({
      env: { OS_ADMIN_EMAILS: undefined, OS_ADMIN_EMAIL: undefined },
    }));
    const { osAdminEmails, isAdmin } = await import("@/lib/is-admin");
    expect(osAdminEmails()).toEqual([]);
    expect(isAdmin("yb@bsd-ybm.co.il")).toBe(false);
  });

  it("allows dev defaults outside production when env empty", async () => {
    envBag.NODE_ENV = "development";
    jest.resetModules();
    jest.doMock("@/lib/env", () => ({
      env: { OS_ADMIN_EMAILS: undefined, OS_ADMIN_EMAIL: undefined },
    }));
    const { osAdminEmails, isAdmin } = await import("@/lib/is-admin");
    expect(osAdminEmails().length).toBeGreaterThan(0);
    expect(isAdmin("yb@bsd-ybm.co.il")).toBe(true);
  });
});

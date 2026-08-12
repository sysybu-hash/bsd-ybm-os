async function loadIsAdmin(envMock: {
  NODE_ENV: "development" | "test" | "production";
  OS_ADMIN_EMAILS?: string;
  OS_ADMIN_EMAIL?: string;
}) {
  jest.resetModules();
  jest.doMock("@/lib/env", () => ({
    env: {
      NODE_ENV: envMock.NODE_ENV,
      OS_ADMIN_EMAILS: envMock.OS_ADMIN_EMAILS,
      OS_ADMIN_EMAIL: envMock.OS_ADMIN_EMAIL,
    },
  }));
  return import("@/lib/is-admin");
}

describe("osAdminEmails / isAdmin", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("uses env allowlist when set", async () => {
    const { osAdminEmails, isAdmin } = await loadIsAdmin({
      NODE_ENV: "production",
      OS_ADMIN_EMAILS: "ops@example.com, other@example.com",
    });
    expect(osAdminEmails()).toEqual(["ops@example.com", "other@example.com"]);
    expect(isAdmin("ops@example.com")).toBe(true);
    expect(isAdmin("stranger@example.com")).toBe(false);
  });

  it("fail-closed in production when env is empty", async () => {
    const { osAdminEmails, isAdmin } = await loadIsAdmin({
      NODE_ENV: "production",
    });
    expect(osAdminEmails()).toEqual([]);
    expect(isAdmin("stranger@example.com")).toBe(false);
  });

  it("allows dev defaults outside production when env empty", async () => {
    const { osAdminEmails, isAdmin } = await loadIsAdmin({
      NODE_ENV: "development",
    });
    expect(osAdminEmails().length).toBeGreaterThan(0);
    expect(isAdmin("yb@bsd-ybm.co.il")).toBe(true);
  });
});

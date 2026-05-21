import { resolveOrganizationForUser } from "@/lib/quota-check";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    organization: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/is-admin", () => ({
  isAdmin: jest.fn((email: string) => email === "admin@bsd-ybm.co.il"),
}));

jest.mock("@/lib/trial", () => ({
  trialEndsAtFromNow: jest.fn(() => new Date("2026-06-01T00:00:00.000Z")),
}));

import { prisma } from "@/lib/prisma";

const mockUserFind = prisma.user.findUnique as jest.Mock;
const mockOrgFind = prisma.organization.findUnique as jest.Mock;

describe("resolveOrganizationForUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("מחזיר org של המשתמש כש-orgId בטוקן לא תואם (לא מנהל פלטפורמה)", async () => {
    mockUserFind.mockResolvedValue({
      organizationId: "org-a",
      email: "user@demo.test",
      name: "User",
    });

    const result = await resolveOrganizationForUser("org-b", "user-1");
    expect(result).toEqual({ id: "org-a" });
    expect(mockOrgFind).not.toHaveBeenCalled();
  });

  it("מאשר orgId מבוקש כשהוא תואם למשתמש", async () => {
    mockUserFind.mockResolvedValue({
      organizationId: "org-a",
      email: "user@demo.test",
      name: "User",
    });

    const result = await resolveOrganizationForUser("org-a", "user-1");
    expect(result).toEqual({ id: "org-a" });
  });

  it("מנהל פלטפורמה יכול לפתור org אחר אם קיים ב-DB", async () => {
    mockUserFind.mockResolvedValue({
      organizationId: "org-a",
      email: "admin@bsd-ybm.co.il",
      name: "Admin",
    });
    mockOrgFind.mockResolvedValue({ id: "org-b" });

    const result = await resolveOrganizationForUser("org-b", "admin-1");
    expect(result).toEqual({ id: "org-b" });
    expect(mockOrgFind).toHaveBeenCalledWith({
      where: { id: "org-b" },
      select: { id: true },
    });
  });
});

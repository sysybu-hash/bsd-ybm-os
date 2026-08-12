jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  authOptions: {},
}));

jest.mock("@/lib/is-admin", () => ({
  isAdmin: jest.fn(),
}));

import { getServerSession } from "next-auth";
import { isAdmin } from "@/lib/is-admin";
import {
  financeMutationRoles,
  requireOSAdminAction,
  requireWorkspaceAction,
} from "@/lib/server-action-auth";

const mockSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockIsAdmin = isAdmin as jest.MockedFunction<typeof isAdmin>;

describe("server-action-auth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requireWorkspaceAction denies unauthenticated", async () => {
    mockSession.mockResolvedValue(null);
    await expect(requireWorkspaceAction()).resolves.toEqual({
      ok: false,
      error: "נדרשת התחברות",
    });
  });

  it("requireWorkspaceAction denies EMPLOYEE for finance roles", async () => {
    mockSession.mockResolvedValue({
      user: { id: "u1", organizationId: "o1", role: "EMPLOYEE", email: "e@x.com" },
    } as never);
    const res = await requireWorkspaceAction({ allowedRoles: financeMutationRoles() });
    expect(res.ok).toBe(false);
  });

  it("requireWorkspaceAction allows ORG_ADMIN for finance roles", async () => {
    mockSession.mockResolvedValue({
      user: { id: "u1", organizationId: "o1", role: "ORG_ADMIN", email: "e@x.com" },
    } as never);
    const res = await requireWorkspaceAction({ allowedRoles: financeMutationRoles() });
    expect(res).toEqual({
      ok: true,
      ctx: {
        userId: "u1",
        organizationId: "o1",
        role: "ORG_ADMIN",
        email: "e@x.com",
      },
    });
  });

  it("requireOSAdminAction denies non-admin", async () => {
    mockSession.mockResolvedValue({
      user: { id: "u1", email: "user@x.com", organizationId: "o1", role: "ORG_ADMIN" },
    } as never);
    mockIsAdmin.mockReturnValue(false);
    await expect(requireOSAdminAction()).resolves.toEqual({
      ok: false,
      error: "אין הרשאת מנהל פלטפורמה",
    });
  });

  it("requireOSAdminAction allows admin", async () => {
    mockSession.mockResolvedValue({
      user: { id: "u1", email: "ops@x.com", organizationId: null, role: "SUPER_ADMIN" },
    } as never);
    mockIsAdmin.mockReturnValue(true);
    await expect(requireOSAdminAction()).resolves.toMatchObject({
      ok: true,
      ctx: { email: "ops@x.com", userId: "u1" },
    });
  });
});

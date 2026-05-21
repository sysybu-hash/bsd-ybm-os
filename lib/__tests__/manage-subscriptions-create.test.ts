import { getServerSession } from "next-auth";
import { manageSubsCreateManualUserAction } from "@/app/actions/manage-subscriptions";
import { prisma } from "@/lib/prisma";
import { sendProvisionCredentialsEmail } from "@/app/actions/send-credentials-email";

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/executive-subscription-super-admin", () => ({
  isExecutiveSubscriptionSuperAdmin: jest.fn(() => true),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    organization: { create: jest.fn(), findFirst: jest.fn() },
  },
}));

jest.mock("@/lib/password", () => ({
  generateProvisionPassword: jest.fn(() => "TempPass123!"),
  hashPassword: jest.fn(async () => "hashed"),
}));

jest.mock("@/app/actions/send-credentials-email", () => ({
  sendProvisionCredentialsEmail: jest.fn(async () => ({ ok: true })),
}));

jest.mock("@/lib/activity-log", () => ({
  logActivity: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

const mockSession = getServerSession as jest.Mock;
const mockPrisma = prisma as unknown as {
  user: { findFirst: jest.Mock };
  organization: { create: jest.Mock; findFirst: jest.Mock };
};
const mockMail = sendProvisionCredentialsEmail as jest.Mock;

describe("manageSubsCreateManualUserAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue({ user: { email: "admin@test.com", id: "u1" } });
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValue({ id: "org_new" });
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org_new" });
    mockMail.mockResolvedValue({ ok: true });
  });

  it("creates organization with COMPANY_MGMT industry and business line", async () => {
    const fd = new FormData();
    fd.set("email", "biz@example.com");
    fd.set("organizationName", "עסק לדוגמה");
    fd.set("tier", "FREE");
    fd.set("industry", "COMPANY_MGMT");
    fd.set("constructionTrade", "SERVICES");

    const result = await manageSubsCreateManualUserAction(fd);
    expect(result).toEqual({ ok: true, emailed: true });

    expect(mockPrisma.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          industry: "COMPANY_MGMT",
          constructionTrade: "SERVICES",
          name: "עסק לדוגמה",
        }),
      }),
    );
  });
});

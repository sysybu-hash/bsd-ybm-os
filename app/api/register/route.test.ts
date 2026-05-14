const mockPrisma = {
  user: {
    findFirst: jest.fn(),
  },
  organization: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  organizationInvite: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  subscriptionInvitation: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockSendRegistrationWelcomeEmail = jest.fn().mockResolvedValue(undefined);
const mockTrialEndsAtFromNow = jest.fn(() => new Date("2026-05-12T00:00:00.000Z"));

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

jest.mock("@/lib/mail", () => ({
  sendRegistrationWelcomeEmail: (...args: unknown[]) =>
    mockSendRegistrationWelcomeEmail(...args),
}));

jest.mock("@/lib/trial", () => ({
  trialEndsAtFromNow: () => mockTrialEndsAtFromNow(),
}));

import { POST } from "@/app/api/register/route";

function createMockRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
  } as Request;
}

describe("POST /api/register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValue({ id: "org_1" });
    mockPrisma.organization.findUnique.mockResolvedValue({ subscriptionTier: "FREE" });
    mockPrisma.organizationInvite.findUnique.mockResolvedValue(null);
    mockPrisma.subscriptionInvitation.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma));
  });

  test("rejects invalid email before hitting the database", async () => {
    const response = await POST(
      createMockRequest({
        email: "bad-email",
        organizationName: "BSD",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  test("creates pending FREE signup for regular registration", async () => {
    const response = await POST(
      createMockRequest({
        email: "owner@example.com",
        name: "Owner",
        organizationName: "Example Org",
        orgType: "company",
        industry: "general",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Example Org",
        type: "COMPANY",
        industry: "CONSTRUCTION",
        constructionTrade: "GENERAL_CONTRACTOR",
        subscriptionTier: "FREE",
        subscriptionStatus: "PENDING_APPROVAL",
        trialEndsAt: new Date("2026-05-12T00:00:00.000Z"),
        cheapScansRemaining: 10,
        premiumScansRemaining: 0,
        maxCompanies: 1,
        users: {
          create: {
            email: "owner@example.com",
            name: "Owner",
            role: "ORG_ADMIN",
            accountStatus: "PENDING_APPROVAL",
          },
        },
      }),
    });
    expect(mockSendRegistrationWelcomeEmail).toHaveBeenCalledWith(
      "owner@example.com",
      "Owner",
      expect.objectContaining({
        tierKey: "FREE",
        accountActive: false,
      }),
    );
  });

  test("creates active signup for a direct paid plan", async () => {
    const response = await POST(
      createMockRequest({
        email: "pro@example.com",
        name: "Pro User",
        organizationName: "Paid Org",
        plan: "company",
        orgType: "enterprise",
        industry: "lawyer",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Paid Org",
        type: "ENTERPRISE",
        industry: "CONSTRUCTION",
        constructionTrade: "GENERAL_CONTRACTOR",
        subscriptionTier: "COMPANY",
        subscriptionStatus: "ACTIVE",
        trialEndsAt: null,
        cheapScansRemaining: 200,
        premiumScansRemaining: 40,
        maxCompanies: 2,
        users: {
          create: {
            email: "pro@example.com",
            name: "Pro User",
            role: "ORG_ADMIN",
            accountStatus: "ACTIVE",
          },
        },
      }),
    });
    expect(mockSendRegistrationWelcomeEmail).toHaveBeenCalledWith(
      "pro@example.com",
      "Pro User",
      expect.objectContaining({
        tierKey: "COMPANY",
        accountActive: true,
      }),
    );
  });

  test("returns conflict when email already exists", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: "user_1" });

    const response = await POST(
      createMockRequest({
        email: "owner@example.com",
        organizationName: "Example Org",
      }),
    );

    expect(response.status).toBe(409);
    expect(mockPrisma.organization.create).not.toHaveBeenCalled();
  });
});

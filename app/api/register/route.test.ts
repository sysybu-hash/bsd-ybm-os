import { NextResponse } from "next/server";
import { POST } from "@/app/api/register/route";
import { prisma } from "@/lib/prisma";
import {
  sendAccessApprovedEmail,
  sendNewRegistrationPendingAdminEmail,
  sendRegistrationWelcomeEmail,
} from "@/lib/mail";
import { trialEndsAtFromNow } from "@/lib/trial";

// Mock dependencies
jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  applyRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
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
    $transaction: jest.fn((cb) => cb({
      user: { findFirst: jest.fn() },
      organization: { create: jest.fn(), findUnique: jest.fn() },
      organizationInvite: { findUnique: jest.fn(), update: jest.fn() },
      subscriptionInvitation: { findUnique: jest.fn(), update: jest.fn() },
    })),
  },
}));

jest.mock("@/lib/mail", () => ({
  sendRegistrationWelcomeEmail: jest.fn().mockResolvedValue(undefined),
  sendRegistrationCredentialsEmail: jest.fn().mockResolvedValue({ ok: true }),
  sendNewRegistrationPendingAdminEmail: jest.fn().mockResolvedValue(undefined),
  sendAccessApprovedEmail: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock("@/lib/password", () => ({
  generateProvisionPassword: jest.fn(() => "GeneratedPass1!"),
  hashPassword: jest.fn(async () => "hashed"),
  validatePasswordStrength: jest.fn(() => ({ ok: true })),
}));

jest.mock("@/lib/trial", () => ({
  trialEndsAtFromNow: jest.fn(() => new Date("2026-05-12T00:00:00.000Z")),
}));

jest.mock("@/lib/platform-settings", () => ({
  getPlatformConfig: jest.fn().mockResolvedValue({
    registrationOpen: true,
    defaultConstructionTrade: "general",
    defaultIndustryForRegistration: "CONSTRUCTION",
    featureFlags: { automationIntents: {} },
  }),
  getDefaultConstructionTradeForRegistration: jest.fn().mockResolvedValue("general"),
  getDefaultIndustryForRegistration: jest.fn().mockResolvedValue("CONSTRUCTION"),
  isRegistrationOpen: jest.fn().mockResolvedValue(true),
}));

// Helper to cast mocks
const mockPrisma = prisma as any;
const mockSendRegistrationWelcomeEmail = sendRegistrationWelcomeEmail as jest.Mock;
const mockSendAccessApprovedEmail = sendAccessApprovedEmail as jest.Mock;
const mockSendNewRegistrationPendingAdminEmail =
  sendNewRegistrationPendingAdminEmail as jest.Mock;
const mockTrialEndsAtFromNow = trialEndsAtFromNow as jest.Mock;

function createMockRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: new Headers({ "x-forwarded-for": "127.0.0.1" }),
  } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValue({ id: "org_1" });
    mockPrisma.organization.findUnique.mockResolvedValue({ subscriptionTier: "FREE" });
    mockPrisma.organizationInvite.findUnique.mockResolvedValue(null);
    mockPrisma.subscriptionInvitation.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  });

  test("rejects invalid email before hitting the database", async () => {
    const response = await POST(
      createMockRequest({
        email: "bad-email",
        organizationName: "BSD",
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toMatchObject({
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
        industry: "CONSTRUCTION",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Example Org",
        type: "COMPANY",
        industry: "CONSTRUCTION",
        constructionTrade: "general",
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
            passwordHash: "hashed",
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
    expect(mockSendNewRegistrationPendingAdminEmail).toHaveBeenCalledWith({
      userEmail: "owner@example.com",
      userName: "Owner",
      organizationName: "Example Org",
    });
  });

  test("creates active signup for a direct paid plan", async () => {
    const response = await POST(
      createMockRequest({
        email: "pro@example.com",
        name: "Pro User",
        organizationName: "Paid Org",
        plan: "company",
        orgType: "enterprise",
        industry: "CONSTRUCTION",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Paid Org",
        type: "ENTERPRISE",
        industry: "CONSTRUCTION",
        constructionTrade: "general",
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
            passwordHash: "hashed",
          },
        },
      }),
    });
    expect(mockSendAccessApprovedEmail).toHaveBeenCalledWith(
      "pro@example.com",
      "Pro User",
      expect.objectContaining({
        variant: "registration_active",
        temporaryPassword: "GeneratedPass1!",
      }),
    );
    expect(mockSendRegistrationWelcomeEmail).not.toHaveBeenCalled();
  });

  test("creates COMPANY_MGMT org when industry is business", async () => {
    const response = await POST(
      createMockRequest({
        email: "biz@example.com",
        name: "Biz Owner",
        organizationName: "Biz Org",
        industry: "COMPANY_MGMT",
        constructionTrade: "SERVICES",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        industry: "COMPANY_MGMT",
        constructionTrade: "SERVICES",
      }),
    });
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

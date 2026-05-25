/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn((fn: (tx: unknown) => Promise<void>) => fn(mockTx)),
  },
}));

const mockTx = {
  activityLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  productPriceObservation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  documentLineItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  documentScanCache: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  quote: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  issuedDocument: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  invoice: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  financialInsight: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  cloudIntegration: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  meckanoZone: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  organizationInvite: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  project: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  contact: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  document: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  user: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  organization: { delete: jest.fn().mockResolvedValue({}) },
};

import { deleteOrganizationCascade } from "@/lib/organization-delete-cascade";

describe("deleteOrganizationCascade", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("deletes org-related rows in order", async () => {
    await deleteOrganizationCascade("org-1");

    expect(mockTx.user.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-1" } });
    expect(mockTx.organization.delete).toHaveBeenCalledWith({ where: { id: "org-1" } });
  });
});

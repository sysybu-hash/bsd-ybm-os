/**
 * @jest-environment node
 */
jest.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      aggregate: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    contact: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    expenseRecord: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    quote: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    issuedDocument: {
      count: jest.fn(),
    },
    financialInsight: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/cashflow-logic", () => ({
  getCashflowForecasting: jest.fn().mockResolvedValue([]),
}));

import { prisma } from "@/lib/prisma";
import { getDashboardStats } from "@/lib/workspace-api/dashboard-stats";

describe("getDashboardStats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.project.aggregate as jest.Mock).mockResolvedValue({ _sum: { budget: 1000 } });
    (prisma.project.count as jest.Mock).mockResolvedValue(3);
    (prisma.contact.count as jest.Mock).mockResolvedValue(5);
    (prisma.expenseRecord.aggregate as jest.Mock).mockResolvedValue({ _sum: { total: 200 } });
    (prisma.quote.count as jest.Mock).mockResolvedValue(1);
    (prisma.issuedDocument.count as jest.Mock).mockResolvedValue(2);
    (prisma.financialInsight.findUnique as jest.Mock).mockResolvedValue({ content: "insight" });
  });

  it("uses aggregates/counts and never unbounded findMany", async () => {
    const stats = await getDashboardStats("org-1");
    expect(stats.totalRevenue).toBe(1000);
    expect(stats.activeProjects).toBe(3);
    expect(stats.totalClients).toBe(5);
    expect(stats.aiInsight).toBe("insight");

    expect(prisma.project.findMany).not.toHaveBeenCalled();
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
    expect(prisma.expenseRecord.findMany).not.toHaveBeenCalled();
    expect(prisma.quote.findMany).not.toHaveBeenCalled();
    expect(prisma.project.aggregate).toHaveBeenCalled();
    expect(prisma.expenseRecord.aggregate).toHaveBeenCalled();
  });
});

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
      count: jest.fn(),
      findMany: jest.fn(),
    },
    quote: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    issuedDocument: {
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    financialInsight: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/upstash-redis", () => ({
  getUpstashRedis: jest.fn().mockReturnValue(null),
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
    (prisma.expenseRecord.count as jest.Mock).mockResolvedValue(4);
    (prisma.quote.count as jest.Mock).mockResolvedValue(1);
    (prisma.issuedDocument.count as jest.Mock).mockResolvedValue(2);
    (prisma.issuedDocument.aggregate as jest.Mock).mockImplementation(async (args: {
      where?: { type?: string | { in?: string[] } };
    }) => {
      const type = args?.where?.type;
      if (type === "CREDIT_NOTE") return { _sum: { total: 50 } };
      return { _sum: { total: 5000 } };
    });
    (prisma.financialInsight.findUnique as jest.Mock).mockResolvedValue({ content: "insight" });
  });

  it("uses issued documents for revenue (not project budgets)", async () => {
    const stats = await getDashboardStats("org-1");
    expect(stats.totalRevenue).toBe(4950); // 5000 - 50 credits
    expect(stats.totalExpenses).toBe(200);
    expect(stats.activeProjects).toBe(3);
    expect(stats.totalClients).toBe(5);
    expect(stats.aiInsight).toBe("insight");
    expect(stats.breakdown.issuedIncomeDocsCount).toBe(2);
    expect(stats.breakdown.projectBudgetsTotal).toBe(1000);
    expect(stats.cashflow.length).toBe(6);

    expect(prisma.project.findMany).not.toHaveBeenCalled();
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
    expect(prisma.expenseRecord.findMany).not.toHaveBeenCalled();
    expect(prisma.quote.findMany).not.toHaveBeenCalled();
    expect(prisma.issuedDocument.aggregate).toHaveBeenCalled();
    expect(prisma.expenseRecord.aggregate).toHaveBeenCalled();
  });
});

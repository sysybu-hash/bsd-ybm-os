import { getExecutiveStats } from "@/lib/executive/executive-stats";

jest.mock("@/lib/workspace-api/dashboard-stats", () => ({
  getDashboardStats: jest.fn().mockResolvedValue({
    totalRevenue: 100000,
    totalExpenses: 40000,
    activeProjects: 3,
    totalClients: 1,
    pendingInvoices: 0,
    aiInsight: "",
    cashflow: [],
    analytics: { monthlyExpenses: [], quoteStatus: [] },
  }),
}));

const mockTaskCount = jest.fn();
const mockProjectCount = jest.fn();
const mockProjectFindMany = jest.fn();
const mockExpenseGroupBy = jest.fn();
const mockProgressBillCount = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { count: (...args: unknown[]) => mockTaskCount(...args) },
    project: {
      count: (...args: unknown[]) => mockProjectCount(...args),
      findMany: (...args: unknown[]) => mockProjectFindMany(...args),
    },
    expenseRecord: { groupBy: (...args: unknown[]) => mockExpenseGroupBy(...args) },
    progressBill: { count: (...args: unknown[]) => mockProgressBillCount(...args) },
  },
}));

describe("getExecutiveStats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTaskCount.mockResolvedValue(5);
    mockProjectCount.mockResolvedValue(2);
    mockProjectFindMany.mockResolvedValue([
      { id: "p1", budget: 10000 },
      { id: "p2", budget: 5000 },
    ]);
    mockExpenseGroupBy.mockResolvedValue([
      { projectId: "p1", _sum: { total: 9500 } },
    ]);
    mockProgressBillCount.mockResolvedValue(1);
  });

  it("aggregates executive KPIs", async () => {
    const stats = await getExecutiveStats("org-1");
    expect(stats.netCashflow).toBe(60000);
    expect(stats.lateTasks).toBe(5);
    expect(stats.activeProjects).toBe(2);
    expect(stats.budgetAlerts).toBe(1);
    expect(stats.pendingProgressBills).toBe(1);
  });
});

import { getCashflowForecasting } from "@/lib/cashflow-logic";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    expenseRecord: {
      groupBy: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

const groupByMock = prisma.expenseRecord.groupBy as jest.Mock;

describe("getCashflowForecasting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    groupByMock.mockResolvedValue([]);
  });

  it("returns 7 points (3 past + current + 3 future)", async () => {
    const points = await getCashflowForecasting("org-1");
    expect(points).toHaveLength(7);
    expect(points.filter((p) => p.type === "past").length).toBe(4);
    expect(points.filter((p) => p.type === "future").length).toBe(3);
  });

  it("aggregates historical expenses by month", async () => {
    const now = new Date();
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 15);
    groupByMock.mockResolvedValue([
      { expenseDate: twoMonthsAgo, _sum: { total: 1200 } },
    ]);

    const points = await getCashflowForecasting("org-1");
    const pastWithActual = points.filter((p) => p.type === "past" && typeof p.actual === "number");
    expect(pastWithActual.length).toBeGreaterThan(0);
    expect(groupByMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-1" }),
      }),
    );
  });
});

import {
  isEmptyReport,
  monthlyHealthOptOutKey,
  previousMonthRange,
  renderMonthlyHealthEmailHtml,
  type MonthlyHealthReport,
} from "@/lib/reports/monthly-health";

function sampleReport(partial?: Partial<MonthlyHealthReport>): MonthlyHealthReport {
  return {
    organizationId: "org1",
    organizationName: "בדיקה בע\"מ",
    periodLabel: "יוני 2026",
    from: new Date(2026, 5, 1),
    to: new Date(2026, 6, 1),
    issuedCount: 4,
    issuedTotal: 50_000,
    expenseCount: 7,
    expenseTotal: 18_500,
    receivablesOpenCount: 2,
    receivablesOpenTotal: 12_000,
    scanCount: 15,
    tasksCompleted: 9,
    netCashflow: 31_500,
    ...partial,
  };
}

describe("monthly-health", () => {
  it("computes previous calendar month bounds and Hebrew label", () => {
    const { from, to, periodLabel } = previousMonthRange(new Date(2026, 6, 1)); // 1 ביולי
    expect(from).toEqual(new Date(2026, 5, 1));
    expect(to).toEqual(new Date(2026, 6, 1));
    expect(periodLabel).toContain("2026");
    expect(periodLabel).toContain("יוני");
  });

  it("handles january rollover to previous year", () => {
    const { from, to } = previousMonthRange(new Date(2026, 0, 1));
    expect(from).toEqual(new Date(2025, 11, 1));
    expect(to).toEqual(new Date(2026, 0, 1));
  });

  it("flags an all-zero report as empty", () => {
    expect(
      isEmptyReport(
        sampleReport({
          issuedCount: 0,
          expenseCount: 0,
          scanCount: 0,
          tasksCompleted: 0,
          receivablesOpenCount: 0,
        }),
      ),
    ).toBe(true);
    expect(isEmptyReport(sampleReport())).toBe(false);
  });

  it("renders RTL email with all KPIs and negative-cashflow styling", () => {
    const html = renderMonthlyHealthEmailHtml(sampleReport());
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("יוני 2026");
    expect(html).toContain("חייבים פתוחים");
    expect(html).toContain("15"); // scans
    expect(html).toContain("#059669"); // positive cashflow green

    const negative = renderMonthlyHealthEmailHtml(sampleReport({ netCashflow: -5000 }));
    expect(negative).toContain("#e11d48"); // negative cashflow red
  });

  it("builds org-scoped opt-out key", () => {
    expect(monthlyHealthOptOutKey("abc")).toBe("monthly_health_optout:abc");
  });
});

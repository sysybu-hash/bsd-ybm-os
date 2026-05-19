import { loadFinanceForecast } from "@/lib/finance-forecast";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    issuedDocument: { findMany: jest.fn() },
    contact: { findMany: jest.fn() },
  },
}));

import { prisma } from "@/lib/prisma";

const issuedFindMany = prisma.issuedDocument.findMany as jest.Mock;
const contactFindMany = prisma.contact.findMany as jest.Mock;

describe("loadFinanceForecast", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    issuedFindMany.mockResolvedValue([
      { total: 1000, status: "PAID" },
      { total: 500, status: "PENDING" },
      { total: 200, status: "DRAFT" },
    ]);
    contactFindMany.mockResolvedValue([
      { value: 10000, status: "LEAD" },
      { value: 20000, status: "PROPOSAL" },
    ]);
  });

  it("sums actual from PAID documents only", async () => {
    const f = await loadFinanceForecast("org-1");
    expect(f.actual).toBe(1000);
    expect(f.pending).toBe(500);
  });

  it("weights contact forecast by status probability", async () => {
    const f = await loadFinanceForecast("org-1");
    // LEAD 15% of 10000 = 1500, PROPOSAL 65% of 20000 = 13000 → 14500
    expect(f.forecast).toBe(14500);
    expect(f.totalProjected).toBe(1000 + 500 + 14500);
  });

  it("returns zeros when no data", async () => {
    issuedFindMany.mockResolvedValue([]);
    contactFindMany.mockResolvedValue([]);
    const f = await loadFinanceForecast("org-1");
    expect(f.actual).toBe(0);
    expect(f.pending).toBe(0);
    expect(f.forecast).toBe(0);
    expect(f.totalProjected).toBe(0);
  });
});

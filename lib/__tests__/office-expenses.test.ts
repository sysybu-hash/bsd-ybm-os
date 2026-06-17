import {
  createOfficeExpense,
  deleteOfficeExpense,
  listOfficeExpenses,
  updateOfficeExpense,
} from "@/lib/workspace-api/office-expenses";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    expenseRecord: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

const findMany = prisma.expenseRecord.findMany as jest.Mock;
const findFirst = prisma.expenseRecord.findFirst as jest.Mock;
const create = prisma.expenseRecord.create as jest.Mock;
const update = prisma.expenseRecord.update as jest.Mock;
const del = prisma.expenseRecord.delete as jest.Mock;

describe("office-expenses workspace api", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists office expenses scoped to org and OFFICE allocation", async () => {
    findMany.mockResolvedValue([
      {
        id: "e1",
        vendorName: "Office Depot",
        invoiceNumber: "100",
        description: null,
        expenseDate: new Date("2026-06-01T12:00:00Z"),
        total: 118,
        amountNet: 100,
        vat: 18,
        allocation: "OFFICE",
        status: "POSTED",
        projectId: null,
        contactId: null,
      },
    ]);

    const rows = await listOfficeExpenses("org-1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          allocation: "OFFICE",
          projectId: null,
        }),
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.vendorName).toBe("Office Depot");
  });

  it("creates office expense without project linkage", async () => {
    create.mockResolvedValue({
      id: "e2",
      vendorName: "Rent",
      invoiceNumber: null,
      description: "Monthly",
      expenseDate: new Date("2026-06-15T12:00:00Z"),
      total: 5000,
      amountNet: 5000,
      vat: 0,
      allocation: "OFFICE",
      status: "POSTED",
      projectId: null,
      contactId: null,
    });

    const row = await createOfficeExpense("org-1", {
      vendorName: "Rent",
      amountNet: 5000,
      description: "Monthly",
      expenseDate: "2026-06-15",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          allocation: "OFFICE",
          projectId: null,
          contactId: null,
          vendorName: "Rent",
        }),
      }),
    );
    expect(row.total).toBe(5000);
  });

  it("returns null when updating missing office expense", async () => {
    findFirst.mockResolvedValue(null);
    const result = await updateOfficeExpense("org-1", "missing", { vendorName: "X" });
    expect(result).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("deletes existing office expense", async () => {
    findFirst.mockResolvedValue({ id: "e3" });
    const ok = await deleteOfficeExpense("org-1", "e3");
    expect(ok).toBe(true);
    expect(del).toHaveBeenCalledWith({ where: { id: "e3" } });
  });
});

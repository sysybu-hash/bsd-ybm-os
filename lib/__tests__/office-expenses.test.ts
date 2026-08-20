import {
  buildOfficeExpenseListWhere,
  createOfficeExpense,
  deleteOfficeExpense,
  listOfficeExpenses,
  OFFICE_EXPENSES_PAGE_SIZE,
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
      count: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

const findMany = prisma.expenseRecord.findMany as jest.Mock;
const findFirst = prisma.expenseRecord.findFirst as jest.Mock;
const create = prisma.expenseRecord.create as jest.Mock;
const update = prisma.expenseRecord.update as jest.Mock;
const del = prisma.expenseRecord.delete as jest.Mock;
const count = prisma.expenseRecord.count as jest.Mock;
const aggregate = prisma.expenseRecord.aggregate as jest.Mock;

const sampleRow = {
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
};

describe("office-expenses workspace api", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    count.mockResolvedValue(1);
    aggregate.mockResolvedValue({ _sum: { total: 118 } });
  });

  it("lists office expenses with pagination metadata", async () => {
    findMany.mockResolvedValue([sampleRow]);

    const result = await listOfficeExpenses("org-1", { skip: 0, take: 30 });
    expect(count).toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          allocation: "OFFICE",
          projectId: null,
        }),
        skip: 0,
        take: 30,
      }),
    );
    expect(result.expenses).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.skip).toBe(0);
    expect(result.take).toBe(30);
    expect(result.totalPosted).toBe(118);
  });

  it("applies server-side search in where clause", () => {
    const where = buildOfficeExpenseListWhere("org-1", { q: "rent" });
    expect(where).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({ vendorName: { contains: "rent", mode: "insensitive" } }),
        ]),
      }),
    );
  });

  it("filters by status in prisma where", async () => {
    findMany.mockResolvedValue([sampleRow]);
    count.mockResolvedValue(1);

    await listOfficeExpenses("org-1", { status: "POSTED" });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "POSTED" }),
      }),
    );
  });

  it("uses default page size when take is omitted", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    const result = await listOfficeExpenses("org-1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: OFFICE_EXPENSES_PAGE_SIZE }),
    );
    expect(result.take).toBe(OFFICE_EXPENSES_PAGE_SIZE);
  });

  it("creates office expense without project linkage", async () => {
    create.mockResolvedValue({
      ...sampleRow,
      id: "e2",
      vendorName: "Rent",
      description: "Monthly",
      total: 5000,
      amountNet: 5000,
      vat: 0,
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

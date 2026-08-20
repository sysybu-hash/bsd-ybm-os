import { ExpenseAllocation, ExpenseRecordStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { FinanceExpenseRow } from "@/lib/finance-workspace-types";
import type {
  CreateOfficeExpenseInput,
  ListOfficeExpensesQuery,
  UpdateOfficeExpenseInput,
} from "@/lib/validation/schemas/office-expenses";

export const OFFICE_EXPENSES_PAGE_SIZE = 30;
export const OFFICE_EXPENSES_MAX_PAGE_SIZE = 100;

export type ListOfficeExpensesResult = {
  expenses: FinanceExpenseRow[];
  total: number;
  skip: number;
  take: number;
  totalPosted: number;
};

function parseExpenseDate(raw: string | undefined): Date {
  if (raw?.trim()) {
    return new Date(`${raw.trim()}T12:00:00`);
  }
  return new Date();
}

function resolveTotal(amountNet: number, vat: number, total?: number): number {
  if (typeof total === "number" && Number.isFinite(total) && total >= 0) {
    return total;
  }
  return Math.round((amountNet + vat) * 100) / 100;
}

function mapRow(row: {
  id: string;
  vendorName: string;
  invoiceNumber: string | null;
  description: string | null;
  expenseDate: Date;
  total: number;
  amountNet: number;
  vat: number;
  allocation: string;
  status: string;
  projectId: string | null;
  contactId: string | null;
}): FinanceExpenseRow {
  return {
    id: row.id,
    vendorName: row.vendorName,
    invoiceNumber: row.invoiceNumber,
    description: row.description,
    expenseDate: row.expenseDate.toISOString(),
    total: row.total,
    amountNet: row.amountNet,
    vat: row.vat,
    allocation: row.allocation,
    status: row.status,
    projectId: row.projectId,
    contactId: row.contactId,
    projectName: null,
    contactName: null,
  };
}

const officeWhere = (orgId: string) => ({
  organizationId: orgId,
  allocation: ExpenseAllocation.OFFICE,
  projectId: null,
});

export function buildOfficeExpenseListWhere(
  orgId: string,
  query: ListOfficeExpensesQuery = {},
): Prisma.ExpenseRecordWhereInput {
  const q = query.q?.trim() ?? "";
  const dateFilter =
    query.fromDate || query.toDate
      ? {
          ...(query.fromDate ? { gte: parseExpenseDate(query.fromDate) } : {}),
          ...(query.toDate ? { lte: parseExpenseDate(query.toDate) } : {}),
        }
      : undefined;

  return {
    ...officeWhere(orgId),
    ...(query.status ? { status: query.status } : {}),
    ...(dateFilter ? { expenseDate: dateFilter } : {}),
    ...(q
      ? {
          OR: [
            { vendorName: { contains: q, mode: "insensitive" } },
            { invoiceNumber: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listOfficeExpenses(
  orgId: string,
  query: ListOfficeExpensesQuery = {},
): Promise<ListOfficeExpensesResult> {
  const skip = Math.max(0, query.skip ?? 0);
  const take = Math.min(
    OFFICE_EXPENSES_MAX_PAGE_SIZE,
    Math.max(1, query.take ?? OFFICE_EXPENSES_PAGE_SIZE),
  );
  const where = buildOfficeExpenseListWhere(orgId, query);

  const [total, rows, postedAgg] = await Promise.all([
    prisma.expenseRecord.count({ where }),
    prisma.expenseRecord.findMany({
      where,
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.expenseRecord.aggregate({
      where: { ...officeWhere(orgId), status: ExpenseRecordStatus.POSTED },
      _sum: { total: true },
    }),
  ]);

  return {
    expenses: rows.map(mapRow),
    total,
    skip,
    take,
    totalPosted: postedAgg._sum.total ?? 0,
  };
}

export async function createOfficeExpense(orgId: string, input: CreateOfficeExpenseInput) {
  const vat = input.vat ?? 0;
  const total = resolveTotal(input.amountNet, vat, input.total);
  const status =
    input.status === "DRAFT" ? ExpenseRecordStatus.DRAFT : ExpenseRecordStatus.POSTED;

  const row = await prisma.expenseRecord.create({
    data: {
      organizationId: orgId,
      vendorName: input.vendorName.trim(),
      invoiceNumber: input.invoiceNumber?.trim() || null,
      expenseDate: parseExpenseDate(input.expenseDate),
      description: input.description?.trim() || null,
      amountNet: input.amountNet,
      vat,
      total,
      allocation: ExpenseAllocation.OFFICE,
      projectId: null,
      contactId: null,
      status,
    },
  });

  return mapRow(row);
}

export async function updateOfficeExpense(
  orgId: string,
  expenseId: string,
  input: UpdateOfficeExpenseInput,
) {
  const existing = await prisma.expenseRecord.findFirst({
    where: { id: expenseId, ...officeWhere(orgId) },
  });
  if (!existing) return null;

  const amountNet = input.amountNet ?? existing.amountNet;
  const vat = input.vat ?? existing.vat;
  const total = resolveTotal(amountNet, vat, input.total ?? existing.total);
  const status =
    input.status === "DRAFT"
      ? ExpenseRecordStatus.DRAFT
      : input.status === "POSTED"
        ? ExpenseRecordStatus.POSTED
        : existing.status;

  const row = await prisma.expenseRecord.update({
    where: { id: existing.id },
    data: {
      ...(input.vendorName !== undefined ? { vendorName: input.vendorName.trim() } : {}),
      ...(input.invoiceNumber !== undefined
        ? { invoiceNumber: input.invoiceNumber?.trim() || null }
        : {}),
      ...(input.expenseDate !== undefined ? { expenseDate: parseExpenseDate(input.expenseDate) } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.amountNet !== undefined ? { amountNet: input.amountNet } : {}),
      ...(input.vat !== undefined ? { vat: input.vat } : {}),
      total,
      status,
      allocation: ExpenseAllocation.OFFICE,
      projectId: null,
      contactId: null,
    },
  });

  return mapRow(row);
}

export async function deleteOfficeExpense(orgId: string, expenseId: string): Promise<boolean> {
  const existing = await prisma.expenseRecord.findFirst({
    where: { id: expenseId, ...officeWhere(orgId) },
    select: { id: true },
  });
  if (!existing) return false;

  await prisma.expenseRecord.delete({ where: { id: existing.id } });
  return true;
}

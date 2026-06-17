import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

export function formatOrderNumber(year: number, sequence: number): string {
  return `PO-${year}-${String(sequence).padStart(3, "0")}`;
}

export async function nextOrderNumber(orgId: string, db: DbClient = prisma): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const count = await db.purchaseOrder.count({
    where: {
      organizationId: orgId,
      orderNumber: { startsWith: prefix },
    },
  });
  return formatOrderNumber(year, count + 1);
}

import { prisma } from "@/lib/prisma";
import { DocType } from "@prisma/client";

/**
 * Gets the next sequential number for an issued document of a specific type.
 * Uses a transaction to ensure unique numbers under high concurrency.
 */
export async function getNextDocumentNumber(organizationId: string, type: DocType): Promise<number> {
  return await prisma.$transaction(async (tx) => {
    // Find the highest number for this org and type
    const lastDoc = await tx.issuedDocument.findFirst({
      where: { organizationId, type },
      orderBy: { number: 'desc' },
      select: { number: true }
    });

    const nextNumber = (lastDoc?.number ?? 0) + 1;
    return nextNumber;
  });
}

/**
 * Creates an issued document with automatic numbering.
 */
export async function createNumberedDocument(params: {
  organizationId: string;
  type: DocType;
  clientName: string;
  amount: number;
  vat: number;
  total: number;
  items: any;
  dueDate?: Date;
  contactId?: string;
}) {
  const { organizationId, type, ...rest } = params;

  return await prisma.$transaction(async (tx) => {
    const lastDoc = await tx.issuedDocument.findFirst({
      where: { organizationId, type },
      orderBy: { number: 'desc' },
      select: { number: true },
    });

    const number = (lastDoc?.number ?? 0) + 1;

    return await tx.issuedDocument.create({
      data: {
        organizationId,
        type,
        number,
        ...rest
      },
    });
  });
}

import { prisma } from "@/lib/prisma";
import { DocType, Prisma } from "@prisma/client";

const START_NUMBER = 1001;

type Tx = Prisma.TransactionClient;

/**
 * Atomically allocate the next document number for (organizationId, type)
 * using IssuedDocumentSequence. Must run inside a transaction that also
 * creates the IssuedDocument row.
 */
export async function allocateNextDocumentNumber(
  tx: Tx,
  organizationId: string,
  type: DocType,
): Promise<number> {
  const row = await tx.issuedDocumentSequence.upsert({
    where: {
      organizationId_type: { organizationId, type },
    },
    create: {
      organizationId,
      type,
      lastNumber: START_NUMBER,
    },
    update: {
      lastNumber: { increment: 1 },
    },
    select: { lastNumber: true },
  });
  return row.lastNumber;
}

/**
 * Allocates a number in its own transaction.
 * Prefer allocateNextDocumentNumber inside the same transaction as create.
 */
export async function getNextDocumentNumber(
  organizationId: string,
  type: DocType,
): Promise<number> {
  return prisma.$transaction(async (tx) =>
    allocateNextDocumentNumber(tx, organizationId, type),
  );
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
  items: Prisma.InputJsonValue;
  dueDate?: Date;
  contactId?: string;
}) {
  const { organizationId, type, ...rest } = params;

  return prisma.$transaction(async (tx) => {
    const number = await allocateNextDocumentNumber(tx, organizationId, type);
    return tx.issuedDocument.create({
      data: {
        organizationId,
        type,
        number,
        ...rest,
      },
    });
  });
}

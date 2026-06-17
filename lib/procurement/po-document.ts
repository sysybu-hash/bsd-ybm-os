import { Prisma } from "@prisma/client";
import { calculateDocumentTotalsFromOrg } from "@/lib/billing-calculations";
import { createLogger } from "@/lib/logger";
import {
  mapPoLinesToIssuedItems,
  netAmountFromIssuedItems,
} from "@/lib/procurement/po-lines-to-items";
import { PoDocumentError } from "@/lib/procurement/po-errors";
import { updatePoStatus } from "@/lib/procurement/update-po-status";
import { prisma } from "@/lib/prisma";

const log = createLogger("procurement-po-document");

const MAX_NUMBER_ALLOC_ATTEMPTS = 3;

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function allocatePurchaseOrderDocNumber(
  tx: Prisma.TransactionClient,
  orgId: string,
): Promise<number> {
  const last = await tx.issuedDocument.findFirst({
    where: { organizationId: orgId, type: "PURCHASE_ORDER" },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 1000) + 1;
}

export async function createIssuedDocumentFromPurchaseOrder(
  orgId: string,
  userId: string,
  purchaseOrderId: string,
): Promise<{ issuedDocumentId: string; created: boolean }> {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, organizationId: orgId },
    include: { supplier: true, lineItems: true },
  });
  if (!po) throw new PoDocumentError("ORDER_NOT_FOUND");
  if (po.status === "CANCELLED") throw new PoDocumentError("ORDER_CANCELLED");
  if (po.issuedDocumentId) {
    return { issuedDocumentId: po.issuedDocumentId, created: false };
  }
  if (po.lineItems.length === 0) throw new PoDocumentError("NO_LINES");

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { companyType: true, isReportable: true, vatRatePercent: true },
  });
  if (!org) throw new PoDocumentError("ORG_NOT_FOUND");

  const items = mapPoLinesToIssuedItems(po.lineItems);
  const net = netAmountFromIssuedItems(items);
  const totals = calculateDocumentTotalsFromOrg(net, org, { docType: "PURCHASE_ORDER" });
  const clientName = `${po.supplier.name} · ${po.orderNumber}`;

  for (let attempt = 0; attempt < MAX_NUMBER_ALLOC_ATTEMPTS; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const number = await allocatePurchaseOrderDocNumber(tx, orgId);
        const doc = await tx.issuedDocument.create({
          data: {
            organizationId: orgId,
            type: "PURCHASE_ORDER",
            number,
            clientName,
            amount: totals.net,
            vat: totals.vat,
            total: totals.total,
            items,
            status: "PENDING",
            projectId: po.projectId,
            dueDate: po.expectedDate,
            createdByUserId: userId,
          },
        });

        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { issuedDocumentId: doc.id },
        });

        return doc.id;
      });

      return { issuedDocumentId: result, created: true };
    } catch (err: unknown) {
      if (isUniqueConstraintError(err) && attempt < MAX_NUMBER_ALLOC_ATTEMPTS - 1) {
        continue;
      }
      log.error("create PO issued document failed", {
        error: err instanceof Error ? err.message : String(err),
        orgId,
        purchaseOrderId,
      });
      throw err;
    }
  }

  throw new PoDocumentError("NUMBER_ALLOC_FAILED");
}

export async function issuePurchaseOrderDocument(
  orgId: string,
  userId: string,
  purchaseOrderId: string,
  options?: { markSent?: boolean },
) {
  const { issuedDocumentId } = await createIssuedDocumentFromPurchaseOrder(
    orgId,
    userId,
    purchaseOrderId,
  );

  if (options?.markSent) {
    await updatePoStatus(orgId, purchaseOrderId, "SENT");
  }

  const order = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, organizationId: orgId },
    include: {
      supplier: { select: { id: true, name: true } },
      lineItems: true,
    },
  });
  if (!order) throw new PoDocumentError("ORDER_NOT_FOUND");

  return { order, issuedDocumentId };
}

import type { PurchaseOrder, PurchaseOrderLine, Supplier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { suggestedReorderQuantity } from "@/lib/procurement/low-stock-requests";
import { nextOrderNumber } from "@/lib/procurement/order-number";
import { PoError } from "@/lib/procurement/po-errors";
import { inventoryIdFromVirtualRequest, isVirtualRequestId } from "@/lib/procurement/request-id";

export type CreatePoFromRequestInput = {
  orgId: string;
  requestId: string;
  supplierId: string;
  unitPrice: number;
  expectedDate?: Date | null;
  notes?: string | null;
};

export type PurchaseOrderWithRelations = PurchaseOrder & {
  supplier: Supplier;
  lineItems: PurchaseOrderLine[];
};

export async function createPoFromRequest(
  input: CreatePoFromRequestInput,
): Promise<PurchaseOrderWithRelations> {
  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, organizationId: input.orgId },
  });
  if (!supplier) throw new PoError("SUPPLIER_NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    let purchaseRequestId: string;
    let quantityNeeded: number;
    let inventoryItemId: string | null = null;
    let projectId: string | null = null;
    let lineDescription: string;

    if (isVirtualRequestId(input.requestId)) {
      const invId = inventoryIdFromVirtualRequest(input.requestId);
      if (!invId) throw new PoError("REQUEST_NOT_FOUND");

      const item = await tx.inventoryItem.findFirst({
        where: { id: invId, organizationId: input.orgId },
      });
      if (!item) throw new PoError("INVENTORY_NOT_FOUND");

      quantityNeeded = suggestedReorderQuantity(item);
      lineDescription = item.name;
      inventoryItemId = item.id;

      const existingPr = await tx.purchaseRequest.findFirst({
        where: {
          organizationId: input.orgId,
          inventoryItemId: invId,
          status: "PENDING",
        },
      });

      if (existingPr) {
        purchaseRequestId = existingPr.id;
        projectId = existingPr.projectId;
      } else {
        const created = await tx.purchaseRequest.create({
          data: {
            organizationId: input.orgId,
            title: item.name,
            source: "LOW_STOCK",
            quantityNeeded,
            inventoryItemId: item.id,
            status: "PENDING",
          },
        });
        purchaseRequestId = created.id;
      }
    } else {
      const pr = await tx.purchaseRequest.findFirst({
        where: { id: input.requestId, organizationId: input.orgId },
      });
      if (!pr) throw new PoError("REQUEST_NOT_FOUND");
      if (pr.status !== "PENDING") throw new PoError("REQUEST_NOT_PENDING");

      purchaseRequestId = pr.id;
      quantityNeeded = pr.quantityNeeded;
      inventoryItemId = pr.inventoryItemId;
      projectId = pr.projectId;
      lineDescription = pr.title;

      if (inventoryItemId) {
        const item = await tx.inventoryItem.findFirst({
          where: { id: inventoryItemId, organizationId: input.orgId },
        });
        if (item) lineDescription = item.name;
      }
    }

    const orderNumber = await nextOrderNumber(input.orgId, tx);
    const totalPrice = quantityNeeded * input.unitPrice;

    const order = await tx.purchaseOrder.create({
      data: {
        orderNumber,
        organizationId: input.orgId,
        supplierId: input.supplierId,
        projectId,
        status: "DRAFT",
        totalAmount: totalPrice,
        currency: "ILS",
        expectedDate: input.expectedDate ?? null,
        notes: input.notes ?? null,
        lineItems: {
          create: {
            description: lineDescription,
            quantity: quantityNeeded,
            unitPrice: input.unitPrice,
            totalPrice,
            inventoryItemId,
          },
        },
      },
      include: {
        supplier: true,
        lineItems: true,
      },
    });

    await tx.purchaseRequest.update({
      where: { id: purchaseRequestId },
      data: { status: "ORDERED" },
    });

    return order;
  });
}

import type { PurchaseOrder, PurchaseOrderLine, Supplier } from "@prisma/client";
import type { PurchaseOrderRow } from "@/lib/validation/schemas/procurement";

export function mapPurchaseOrderRow(
  order: PurchaseOrder & {
    supplier: Pick<Supplier, "id" | "name">;
    lineItems: PurchaseOrderLine[];
  },
): PurchaseOrderRow {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalAmount: order.totalAmount,
    currency: order.currency,
    expectedDate: order.expectedDate?.toISOString() ?? null,
    notes: order.notes,
    issuedDocumentId: order.issuedDocumentId ?? null,
    createdAt: order.createdAt.toISOString(),
    supplier: {
      id: order.supplier.id,
      name: order.supplier.name,
    },
    lineItems: order.lineItems.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      totalPrice: line.totalPrice,
      receivedQty: line.receivedQty,
      inventoryItemId: line.inventoryItemId,
    })),
  };
}

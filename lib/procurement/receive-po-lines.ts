import { prisma } from "@/lib/prisma";
import { computeOrderStatusAfterReceive } from "@/lib/procurement/po-status";
import { ReceivePoError } from "@/lib/procurement/receive-errors";

export type ReceivePoLineInput = {
  lineId: string;
  quantityReceived: number;
};

export type ReceivePoInput = {
  orgId: string;
  orderId: string;
  lines: ReceivePoLineInput[];
};

const RECEIVABLE_STATUSES = new Set(["DRAFT", "SENT", "PARTIAL"]);

export async function receivePoLines(input: ReceivePoInput) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: input.orderId, organizationId: input.orgId },
    include: { lineItems: true },
  });
  if (!order) throw new ReceivePoError("ORDER_NOT_FOUND");
  if (!RECEIVABLE_STATUSES.has(order.status)) {
    throw new ReceivePoError("INVALID_ORDER_STATUS");
  }

  const lineById = new Map(order.lineItems.map((line) => [line.id, line]));

  for (const entry of input.lines) {
    const line = lineById.get(entry.lineId);
    if (!line) throw new ReceivePoError("LINE_NOT_FOUND");
    if (entry.quantityReceived <= 0) throw new ReceivePoError("OVER_RECEIVE");
    if (line.receivedQty + entry.quantityReceived > line.quantity + 1e-9) {
      throw new ReceivePoError("OVER_RECEIVE");
    }
  }

  return prisma.$transaction(async (tx) => {
    for (const entry of input.lines) {
      const line = lineById.get(entry.lineId)!;
      const newReceivedQty = line.receivedQty + entry.quantityReceived;

      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: { receivedQty: newReceivedQty },
      });

      if (line.inventoryItemId) {
        const item = await tx.inventoryItem.findFirst({
          where: { id: line.inventoryItemId, organizationId: input.orgId },
        });
        if (!item) throw new ReceivePoError("INVENTORY_NOT_FOUND");

        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { quantity: item.quantity + entry.quantityReceived },
        });
      }

      line.receivedQty = newReceivedQty;
    }

    const nextStatus = computeOrderStatusAfterReceive(order.lineItems);
    const updated = await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { status: nextStatus },
      include: {
        supplier: { select: { id: true, name: true } },
        lineItems: true,
      },
    });

    return updated;
  });
}

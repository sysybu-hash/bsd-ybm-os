import { prisma } from "@/lib/prisma";
import { canTransitionPoStatus, type PoStatus } from "@/lib/procurement/po-status";
import { UpdatePoStatusError } from "@/lib/procurement/receive-errors";

export async function updatePoStatus(orgId: string, orderId: string, status: PoStatus) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: orderId, organizationId: orgId },
  });
  if (!order) throw new UpdatePoStatusError("ORDER_NOT_FOUND");
  if (!canTransitionPoStatus(order.status, status)) {
    throw new UpdatePoStatusError("INVALID_TRANSITION");
  }

  return prisma.purchaseOrder.update({
    where: { id: order.id },
    data: { status },
    include: {
      supplier: { select: { id: true, name: true } },
      lineItems: true,
    },
  });
}

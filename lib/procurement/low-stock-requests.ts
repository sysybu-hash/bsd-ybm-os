import type { InventoryItem } from "@prisma/client";
import type { ProcurementRequestRow } from "@/lib/validation/schemas/procurement";

/** כמות מומלצת להזמנה כשהמלאי יורד מתחת למינימום */
export function suggestedReorderQuantity(item: Pick<InventoryItem, "quantity" | "minQuantity">): number {
  const target = item.minQuantity * 2;
  const needed = target - item.quantity;
  return Math.max(needed, 1);
}

export function isLowStockItem(item: Pick<InventoryItem, "quantity" | "minQuantity">): boolean {
  return item.minQuantity > 0 && item.quantity <= item.minQuantity;
}

export function mapLowStockToVirtualRequest(
  item: Pick<InventoryItem, "id" | "name" | "quantity" | "minQuantity" | "unit">,
): ProcurementRequestRow {
  const quantityNeeded = suggestedReorderQuantity(item);
  return {
    id: `auto-${item.id}`,
    title: item.name,
    status: "PENDING",
    source: "LOW_STOCK",
    quantityNeeded,
    inventoryItemId: item.id,
    projectId: null,
    notes: null,
    createdAt: new Date().toISOString(),
    isVirtual: true,
    virtualMeta: {
      itemName: item.name,
      quantity: item.quantity,
      minQuantity: item.minQuantity,
      unit: item.unit,
    },
  };
}

import {
  isLowStockItem,
  mapLowStockToVirtualRequest,
  suggestedReorderQuantity,
} from "@/lib/procurement/low-stock-requests";

describe("low-stock-requests", () => {
  it("detects low stock when quantity is at or below minimum", () => {
    expect(isLowStockItem({ quantity: 5, minQuantity: 5 })).toBe(true);
    expect(isLowStockItem({ quantity: 3, minQuantity: 5 })).toBe(true);
    expect(isLowStockItem({ quantity: 6, minQuantity: 5 })).toBe(false);
    expect(isLowStockItem({ quantity: 0, minQuantity: 0 })).toBe(false);
  });

  it("suggests reorder quantity as double minimum minus current stock", () => {
    expect(suggestedReorderQuantity({ quantity: 2, minQuantity: 10 })).toBe(18);
    expect(suggestedReorderQuantity({ quantity: 10, minQuantity: 10 })).toBe(10);
  });

  it("maps inventory row to virtual procurement request", () => {
    const row = mapLowStockToVirtualRequest({
      id: "inv1",
      name: "מלט",
      quantity: 2,
      minQuantity: 10,
      unit: "שק",
    });
    expect(row.id).toBe("auto-inv1");
    expect(row.isVirtual).toBe(true);
    expect(row.inventoryItemId).toBe("inv1");
    expect(row.virtualMeta?.itemName).toBe("מלט");
  });
});

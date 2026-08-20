import { mapPoLinesToIssuedItems, netAmountFromIssuedItems } from "@/lib/procurement/po-lines-to-items";

describe("mapPoLinesToIssuedItems", () => {
  it("maps purchase order lines to issued document items", () => {
    const items = mapPoLinesToIssuedItems([
      { description: "ברזל 12", quantity: 10, unitPrice: 25.5 },
      { description: "בטון", quantity: 2, unitPrice: 100 },
    ]);

    expect(items).toEqual([
      { desc: "ברזל 12", qty: 10, price: 25.5 },
      { desc: "בטון", qty: 2, price: 100 },
    ]);
    expect(netAmountFromIssuedItems(items)).toBe(455);
  });
});

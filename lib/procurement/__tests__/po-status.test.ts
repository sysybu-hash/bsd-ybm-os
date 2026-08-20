import {
  canTransitionPoStatus,
  computeOrderStatusAfterReceive,
  remainingQty,
} from "@/lib/procurement/po-status";

describe("po-status", () => {
  it("allows draft to sent and cancelled", () => {
    expect(canTransitionPoStatus("DRAFT", "SENT")).toBe(true);
    expect(canTransitionPoStatus("DRAFT", "CANCELLED")).toBe(true);
    expect(canTransitionPoStatus("DRAFT", "RECEIVED")).toBe(false);
  });

  it("computes received when all lines complete", () => {
    expect(
      computeOrderStatusAfterReceive([
        { quantity: 10, receivedQty: 10 },
        { quantity: 5, receivedQty: 5 },
      ]),
    ).toBe("RECEIVED");
    expect(
      computeOrderStatusAfterReceive([{ quantity: 10, receivedQty: 4 }]),
    ).toBe("PARTIAL");
  });

  it("computes remaining quantity", () => {
    expect(remainingQty({ quantity: 10, receivedQty: 3 })).toBe(7);
    expect(remainingQty({ quantity: 10, receivedQty: 12 })).toBe(0);
  });
});
